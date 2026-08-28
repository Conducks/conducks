#!/usr/bin/env node
/**
 * Conducks — does a node's recorded line match where the declaration actually is? 🏺
 *
 * ADR 0180 scored node COMPLETENESS and keyed it by file+name on purpose, saying that a node's
 * recorded line is a separate claim with its own failure mode. This is that claim.
 *
 * It matters more than it looks. Every finding conducks prints carries a `file:line` a person clicks,
 * and `conducks-docs` §1 makes an anchor the difference between a doc that can be acted on and one
 * that costs the reader a search. A line that is quietly two out is worse than no line: it looks
 * authoritative and sends the reader to the wrong place.
 *
 * THE ORACLE is Python's `ast`, which records `lineno` for every declaration.
 *
 * DECORATORS WERE THE EXPECTED DIVERGENCE AND ARE NOT ONE. `ast` reports the `def` line for a
 * decorated function and a parser anchored on the whole declaration might report the first decorator
 * instead — so the check began by accepting either. Measured across 1,207 declarations that tolerance
 * changed nothing, and it was removed. Decorated cases are still counted apart, because if the two
 * ever diverge that is the shape it will take.
 *
 * ONE TOLERANCE REMAINS AND IS NECESSARY: a name may be declared more than once in a file — an
 * override, a nested helper, two classes with the same method — so a match against any recorded line
 * for that name is accepted. Measured on scraper: 58 of 7,598 file+name keys hold more than one line,
 * so it is real and small. Asking WHICH occurrence a node is would be a stricter claim than "this is
 * a real declaration line for this name".
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();

const PY = `
import ast, json, os, sys
root = sys.argv[1]
SKIP = {'node_modules', '.git', '.conducks', 'venv', '.venv', '__pycache__',
        'site-packages', 'dist', 'build'}
out = []
for dp, dn, fn in os.walk(root):
    dn[:] = [d for d in dn if d not in SKIP]
    for f in fn:
        if not f.endswith('.py'): continue
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, root)
        try:
            tree = ast.parse(open(p, encoding='utf-8', errors='ignore').read())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                decs = [d.lineno for d in node.decorator_list]
                out.append({
                    "file": rel, "name": node.name, "line": node.lineno,
                    "first": min(decs) if decs else node.lineno,
                    "decorated": bool(decs),
                })
print(json.dumps(out))
`;

const decls = JSON.parse(execFileSync('python3', ['-c', PY, projectDir], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const rows = await (await conn.run(`SELECT name, file, lineStart FROM nodes WHERE file LIKE '%.py'`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const lowerRoot = projectDir.toLowerCase();
const relOf = (f) => {
  const a = String(f).toLowerCase();
  return a.startsWith(lowerRoot) ? a.slice(lowerRoot.length).replace(/^[/\\]/, '') : a;
};
// A name may occur more than once in a file (an overridden method, a nested helper). Keep every
// recorded line and accept a match against any of them — asking WHICH occurrence a node is would be
// scoring a stricter claim than "the line is a real declaration line for this name".
const lines = new Map();
for (const r of rows) {
  const k = `${relOf(r.file)}::${String(r.name).toLowerCase()}`;
  if (!lines.has(k)) lines.set(k, new Set());
  if (r.lineStart !== null && r.lineStart !== undefined) lines.get(k).add(Number(r.lineStart));
}

const isTest = (p) => /(^|\/)(tests?|__tests__|fixtures?)\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /_test\.py$/.test(p);

let scored = 0, noNode = 0;
const wrongPlain = [], wrongDecorated = [];
for (const d of decls) {
  if (isTest(d.file)) continue;
  const got = lines.get(`${d.file.toLowerCase()}::${d.name.toLowerCase()}`);
  if (!got || got.size === 0) { noNode++; continue; }
  scored++;
  // THE `def` LINE, exactly. A tolerance accepting the first DECORATOR line was written first, on the
  // reasoning that both are defensible anchors — measured across 1,207 declarations it changed the
  // result by zero, because conducks records the `def` line just as `ast` does. Removed: a tolerance
  // that never fires can only ever hide a real drift (Rule 8).
  if (got.has(d.line)) continue;
  (d.decorated ? wrongDecorated : wrongPlain).push({ ...d, got: [...got].slice(0, 3) });
}

const pct = scored ? (((scored - wrongPlain.length - wrongDecorated.length) / scored) * 100).toFixed(2) : '0';
console.log(`\n--- declaration lines vs node lineStart (${path.basename(projectDir)}) ---`);
console.log(`  declarations scored        : ${scored}`);
console.log(`  skipped — no node for name : ${noNode}`);
console.log(`  WRONG LINE, undecorated    : ${wrongPlain.length}`);
for (const w of wrongPlain.slice(0, 8)) console.log(`      ${w.name}  ${w.file}  ast ${w.line}, graph ${w.got.join('/')}`);
console.log(`  WRONG LINE, decorated      : ${wrongDecorated.length}   (a known divergence — see the header)`);
for (const w of wrongDecorated.slice(0, 4)) console.log(`      ${w.name}  ${w.file}  ast ${w.line} (dec ${w.first}), graph ${w.got.join('/')}`);
console.log(`  line accuracy              : ${pct}%`);

if (scored === 0) {
  console.error(`\n✖ nothing could be scored. That is a broken oracle, not an empty project.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::lines`;
const prev = baseline[key];

let failed = false;
if (prev && wrongPlain.length > prev.wrong) {
  console.error(`\n✖ LINE ACCURACY WENT BACKWARDS: ${prev.wrong} wrong before, ${wrongPlain.length} now.`);
  failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.\n`);
} else if (failed) {
  process.exit(1);
}
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { scored, wrong: wrongPlain.length, decorated: wrongDecorated.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ line accuracy did not regress.\n`);
