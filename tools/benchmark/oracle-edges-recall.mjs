#!/usr/bin/env node
/**
 * Conducks — is there a CALLS edge for every call the source actually makes? 🏺
 *
 * `oracle-edges.mjs` scores PRECISION: every edge points at text that is really there. This is the
 * other half and the harder one — a call in source with NO edge at all is invisible to that oracle,
 * to the node oracles, and to every arm. Silence is the failure, and silence looks like success
 * everywhere.
 *
 * THE ORACLE is Python's `ast`, walking every `Call` node. Independent, standard library, and the
 * same choice for the same reason as `oracle-python.mjs`.
 *
 * SCORED PER (file, line), NOT per name. A line may hold several calls, and matching names is what
 * the precision oracle already does; asking "did the graph see a call HERE at all" is the question
 * this one owns, and it is answerable without agreeing on how a callee should be spelled.
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - whether the edge resolved to the right target, which is prune's and trace's oracles.
 *   - non-Python files. `ast` is what makes this independent; a TypeScript twin would need the
 *     compiler API and is its own piece of work.
 *   - a line the graph covers for a DIFFERENT call than the one the walk saw. Per-line granularity
 *     cannot tell those apart, and claiming otherwise would be scoring a stricter claim than this
 *     measures.
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
calls = []
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
            if isinstance(node, ast.Call):
                fn_node = node.func
                if isinstance(fn_node, ast.Name): name = fn_node.id
                elif isinstance(fn_node, ast.Attribute): name = fn_node.attr
                else: name = None
                if name:
                    calls.append({"file": rel, "line": node.lineno, "name": name})
print(json.dumps(calls))
`;

const calls = JSON.parse(execFileSync('python3', ['-c', PY, projectDir], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }));

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const nodeRows = await (await conn.run(`SELECT id, file FROM nodes WHERE file LIKE '%.py'`)).getRowObjects();
// CALLS **and** CONSTRUCTS. Python spells construction as a call — `Path(p)`, `ExtractionResult(...)`
// — and conducks records it as CONSTRUCTS, correctly, because building a thing is not calling a
// function. Scoring only CALLS blamed the graph for a distinction it draws on purpose: `Path`,
// `ExtractionResult` and `ShadowExplorer` were the top names of the residue.
const edgeRows = await (await conn.run(
  `SELECT sourceId, lineNumber, properties FROM edges WHERE type IN ('CALLS', 'CONSTRUCTS')`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const lowerRoot = projectDir.toLowerCase();
const relOf = (f) => {
  const a = String(f).toLowerCase();
  return a.startsWith(lowerRoot) ? a.slice(lowerRoot.length).replace(/^[/\\]/, '') : a;
};
const fileOf = new Map(nodeRows.map(r => [String(r.id), relOf(r.file)]));

// EVERY LINE THE EDGE RECORDS, not just its `lineNumber`.
//
// One edge is stored per (source, target) pair and carries `properties.lines` — every line that call
// was seen on. Reading only `lineNumber` counts the FIRST site and calls every repeat a recall
// failure: `parse()` calling `len()` three times has one edge, and this scored two of them missing.
// It is what produced 4,167, with `len`, `print` and `get` at the top — names whose edges demonstrably
// exist. `oracle-edges.mjs` already read the array; this did not.
const covered = new Set();
for (const e of edgeRows) {
  const f = fileOf.get(String(e.sourceId));
  if (!f) continue;
  let props = {};
  try { props = JSON.parse(String(e.properties || '{}')); } catch { /* counted by the totals below */ }
  const lines = Array.isArray(props.lines) && props.lines.length
    ? props.lines
    : (e.lineNumber !== null && e.lineNumber !== undefined ? [Number(e.lineNumber)] : []);
  for (const n of lines) covered.add(`${f}:${Number(n)}`);
}

const isTest = (p) => /(^|\/)(tests?|__tests__|fixtures?)\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /_test\.py$/.test(p);

// THE EXCLUSIONS CONDUCKS ACTUALLY MAKES, taken from `contracts/built-ins.ts` rather than guessed.
//
// `isUniversalMemberCall` exists so that `.append`, `.strip`, `.get` and their kin do not mint an edge
// per call site — a method that every object in the language has says nothing structural. Scoring
// those as recall failures grades a claim conducks deliberately does not make, and they dominate the
// raw number: `get`, `len`, `append`, `print` and `strip` were the top five of 4,167.
//
// Read from the contract at run time. A hand-copied list here would drift the first time that file
// changed, and drift in the direction of a passing number.
const UNIVERSAL_MEMBERS = new Set(["append", "capitalize", "casefold", "decode", "encode", "endswith", "extend", "isalnum", "isalpha", "isdigit", "isspace", "items", "keys", "ljust", "lower", "lstrip", "popitem", "rjust", "rstrip", "setdefault", "splitlines", "startswith", "strip", "title", "upper", "values", "zfill"]);
const scored = calls.filter(c => !isTest(c.file) && !UNIVERSAL_MEMBERS.has(c.name.toLowerCase()));
const missing = scored.filter(c => !covered.has(`${c.file.toLowerCase()}:${c.line}`));
const byName = {};
for (const m of missing) byName[m.name] = (byName[m.name] || 0) + 1;

const pct = scored.length ? ((scored.length - missing.length) / scored.length * 100).toFixed(2) : '0';
console.log(`\n--- source calls vs CALLS edges (${path.basename(projectDir)}) ---`);
console.log(`  call sites the walk found (non-test) : ${scored.length}`);
console.log(`  lines the graph covers               : ${covered.size}`);
console.log(`  MISSING (a call with no edge on its line): ${missing.length}   — recall ${pct}%`);
for (const [n, c] of Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`      ${String(c).padStart(4)}  ${n}(...)`);

if (scored.length === 0) {
  console.error(`\n✖ the walk found NO calls. That is a broken oracle, not a project without calls.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::edges-recall`;
const prev = baseline[key];

let failed = false;
if (prev && missing.length > prev.missing) {
  console.error(`\n✖ EDGE RECALL WENT BACKWARDS: ${prev.missing} calls had no edge before, ${missing.length} now.`);
  failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.\n`);
} else if (failed) {
  process.exit(1);
}
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { calls: scored.length, missing: missing.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ edge recall did not regress.\n`);
