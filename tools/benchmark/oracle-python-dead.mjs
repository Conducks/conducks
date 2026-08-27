#!/usr/bin/env node
/**
 * Conducks — score Python `ORPHAN` and `ONLY_IMPORTED` against Python's own parser. 🏺
 *
 * WHY THIS EXISTS. Until it did, TypeScript had an oracle for every verdict prune makes — imports
 * through `tsc --noUnusedLocals`, exports and orphans through the LanguageService's own reference
 * resolution — and Python had one for exactly ONE of them. `oracle-python.mjs` line 148 reads
 * `if (f.type !== 'STALE_IMPORT') continue;`, so every Python ORPHAN was resting on hand-reading.
 *
 * That is the wrong place to have the gap. THREE of the four defects found on 2026-08-27 were
 * Python, and the largest — `from pkg import module` binding nothing, so `page_source.capture_dom()`
 * resolved against the package — produced EIGHT false ORPHANs on the scraper subject. It was caught
 * by refreshing the subject, not by a check. Nothing would have caught the next one.
 *
 * THE CLAIM BEING TESTED, exactly as prune words it:
 *   ORPHAN         — "defined but never referenced (no callers, constructors, or type references)".
 *                    ANY reference outside the symbol's own body contradicts it.
 *   ONLY_IMPORTED  — "every reference is an import the importing file never uses". So an import IS
 *                    expected; any NON-import reference contradicts it.
 *
 * Scoring ORPHAN against "referenced anywhere including inside itself" would fail the tool for
 * something it never said: a recursive function calls its own name, and that is not a caller. The
 * walk therefore excludes references inside the definition's own line span.
 *
 * WHAT IT CANNOT SEE, stated rather than found out later:
 *   - a name reached only through `getattr`, a string key, or a registry populated at runtime
 *   - a name referenced only from a file this walk cannot parse
 *   - RECALL is a proxy, not a measure. prune deliberately exempts entry points and symbols handed
 *     to a registering decorator, and this models those two exemptions and no others — so MISSED is
 *     reported and ratcheted, never demanded to be zero.
 *
 * EXTRA is the exact half, and the one that matters: if prune says nothing references a symbol and
 * the parser finds a reference, prune is wrong, with no judgement required.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resetVault } from './reset-vault.mjs';

const projectDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|fixtures?)\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /_test\.py$/.test(p);

const PY = `
import ast, json, os, sys

root = sys.argv[1]
SKIP = {'node_modules', '.git', '.conducks', 'venv', '.venv', '__pycache__',
        'site-packages', 'dist', 'build', 'scratch'}

files = []
for dp, dn, fn in os.walk(root):
    dn[:] = [d for d in dn if d not in SKIP]
    for f in fn:
        if f.endswith('.py'):
            files.append(os.path.join(dp, f))

# Module-level definitions, with the line span of each so a symbol's own body can be excluded from
# its reference count -- a recursive call is not a caller.
defs = {}          # (relfile, name) -> {"line": int, "end": int, "decorated": bool}
refs = {}          # name -> count of references NOT inside that name's own definition
entrypoint_files = set()

def add_ref(name, relfile, line):
    if not name: return
    d = defs.get((relfile, name))
    if d and d["line"] <= line <= d["end"]:
        return                      # inside its own body: self-reference, not a caller
    refs[name] = refs.get(name, 0) + 1

parsed = []
for p in files:
    rel = os.path.relpath(p, root)
    try:
        tree = ast.parse(open(p, encoding='utf-8', errors='ignore').read())
    except SyntaxError:
        continue
    parsed.append((rel, tree))
    for node in tree.body:                       # MODULE LEVEL only, matching isModuleScoped
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defs[(rel, node.name)] = {
                "line": node.lineno,
                "end": getattr(node, 'end_lineno', node.lineno),
                "decorated": bool(node.decorator_list),
            }

for rel, tree in parsed:
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            add_ref(node.id, rel, getattr(node, 'lineno', 0))
        elif isinstance(node, ast.Attribute):
            add_ref(node.attr, rel, getattr(node, 'lineno', 0))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            # __all__ entries and string annotations name a symbol as surely as an identifier does
            if node.value.isidentifier():
                add_ref(node.value, rel, getattr(node, 'lineno', 0))
        elif isinstance(node, ast.If):
            t = node.test
            if isinstance(t, ast.Compare) and isinstance(t.left, ast.Name) and t.left.id == '__name__':
                entrypoint_files.add(rel)

out = {
    "defs": [{"file": f, "name": n, **d} for (f, n), d in defs.items()],
    "refs": refs,
    "entrypoints": sorted(entrypoint_files),
}
print(json.dumps(out))
`;

function oracle() {
  const raw = execFileSync('python3', ['-c', PY, projectDir], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(raw);
}

function conducksDead() {
  // Same discipline as oracle-python.mjs: a grammar change alters no file hash, so a stale vault
  // would score the PREVIOUS build and report success.
  resetVault(projectDir);
  execFileSync('node', [CLI, 'analyze'], { cwd: projectDir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  const raw = execFileSync('node', [CLI, 'prune', '--json'], { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lowerRoot = projectDir.toLowerCase();
  const out = [];
  const spoke = new Set();
  for (const f of JSON.parse(raw)) {
    // TWO DIFFERENT QUESTIONS, and conflating them invented a recall gap on the first run.
    //
    // `spoke` answers "did prune say ANYTHING about this symbol", which is what a MISSED count needs:
    // `Hierarchy` was reported UNIMPORTED_MODULE and counted as silence, so the oracle reported a
    // recall gap prune did not have.
    //
    // `out` is narrower on purpose. EXTRA is scored only against the two verdicts that claim
    // "nothing references this symbol". UNIMPORTED_MODULE claims something else entirely — that
    // nothing imports the FILE — and a reference to the symbol does not contradict it. Scoring it
    // there would fail the tool for a claim it never made.
    const absAny = String(f.file).toLowerCase();
    const relAny = absAny.startsWith(lowerRoot) ? absAny.slice(lowerRoot.length).replace(/^[/\\]/, '') : absAny;
    spoke.add(`${relAny}::${f.symbol}`);
    if (f.type !== 'ORPHAN' && f.type !== 'ONLY_IMPORTED') continue;
    const abs = String(f.file).toLowerCase();
    const rel = abs.startsWith(lowerRoot) ? abs.slice(lowerRoot.length).replace(/^[/\\]/, '') : abs;
    if (!rel.endsWith('.py') || isTestPath(rel)) continue;
    out.push({ ...f, rel });
  }
  return { out, spoke };
}

const { defs, refs, entrypoints } = oracle();
const { out: ours, spoke } = conducksDead();
const entry = new Set(entrypoints);

// EXTRA — prune says nothing references it, the parser found a reference. Exact, no judgement.
const extra = ours.filter(f => (refs[f.symbol] || 0) > 0);

// MISSED — a module-level definition the parser never sees referenced, that prune stayed silent on.
// prune's own exemptions are modelled: a decorated symbol may be handed to a registry, and a file
// with an `if __name__` block is an entry point. Nothing else is modelled, which is why this
// ratchets rather than being required to reach zero.
const flagged = spoke;   // prune said SOMETHING about it — see the note in conducksDead
const missed = defs.filter(d =>
  !isTestPath(d.file) &&
  !d.decorated &&
  !entry.has(d.file) &&
  !d.name.startsWith('_') &&
  (refs[d.name] || 0) === 0 &&
  !flagged.has(`${d.file}::${d.name}`),
);

console.log(`\n--- Python ORPHAN / ONLY_IMPORTED vs python's own ast (${path.basename(projectDir)}) ---`);
console.log(`  module-level definitions walked : ${defs.length}`);
console.log(`  conducks says dead              : ${ours.length}`);
console.log(`  MISSED (ast sees no reference, conducks silent): ${missed.length}`);
for (const m of missed.slice(0, 12)) console.log(`      ${m.name}  ${m.file}`);
if (missed.length > 12) console.log(`      … ${missed.length - 12} more`);
console.log(`  EXTRA (conducks says dead, ast finds a reference): ${extra.length}`);
for (const e of extra.slice(0, 12)) console.log(`      ${e.symbol}  ${e.rel}  (${refs[e.symbol]} reference(s))`);

if (defs.length === 0) {
  console.error(`\n✖ the walk found NO module-level definitions. That is a broken oracle, not a clean project.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::python-dead`;
const prev = baseline[key];

let failed = false;
if (extra.length > 0) { console.error(`\n✖ ${extra.length} finding(s) python's own parser contradicts.`); failed = true; }
if (prev && missed.length > prev.missed) {
  console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missed.length} now.`); failed = true;
}
if (failed) process.exit(1);

// A MISSING BASELINE IS NOT A PASS (ADR 0044) — same rule as every other oracle here.
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { defs: defs.length, dead: ours.length, missed: missed.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ no Python dead-code verdict contradicts the parser, and recall did not regress.\n`);
