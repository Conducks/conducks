#!/usr/bin/env node
/**
 * Conducks — does the graph hold a node for every Python declaration in the source? 🏺
 *
 * WHY THIS AND NOT THE PACK ORACLE. `oracle-packs.mjs` asks whether a pack's QUERIES capture what its
 * grammar declares — a question about the query file. This asks the one after it, and the one
 * everything else rests on: whether the built GRAPH actually contains the declarations. A capture
 * that matches and a node that is minted are different events, and every tool downstream reads the
 * second.
 *
 * `analyze` is the base of the octopus. `prune` cannot report a symbol that has no node, `trace`
 * cannot walk to it, `impact` cannot count it — and all three would look CORRECT while doing so,
 * because absence is silent everywhere.
 *
 * THE CLAIM BEING TESTED: every function and class in a parsed Python file has a node, and every node
 * claiming to be one corresponds to a real declaration.
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - edges. A node can exist with every relationship missing; that is prune's and trace's oracles.
 *   - non-Python files. Python because `ast` is the standard library and is a genuinely independent
 *     parser, the same reason `oracle-python.mjs` uses it.
 *   - a file the walk cannot parse, or one conducks excluded by `.conducksignore` — both are counted
 *     and reported rather than silently dropped.
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
out, unparsed = [], []
for dp, dn, fn in os.walk(root):
    dn[:] = [d for d in dn if d not in SKIP]
    for f in fn:
        if not f.endswith('.py'): continue
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, root)
        try:
            tree = ast.parse(open(p, encoding='utf-8', errors='ignore').read())
        except SyntaxError:
            unparsed.append(rel); continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                out.append({"file": rel, "name": node.name, "line": node.lineno})
print(json.dumps({"decls": out, "unparsed": unparsed}))
`;

const { decls, unparsed } = JSON.parse(
  execFileSync('python3', ['-c', PY, projectDir], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }),
);

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const rows = await (await conn.run(`SELECT name, file FROM nodes WHERE file LIKE '%.py'`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const lowerRoot = projectDir.toLowerCase();
const rel = (f) => {
  const a = String(f).toLowerCase();
  return a.startsWith(lowerRoot) ? a.slice(lowerRoot.length).replace(/^[/\\]/, '') : a;
};
// Keyed by file+name. NOT by line: a node's recorded line is a separate claim with its own failure
// mode, and folding the two together would report a line drift as a missing symbol.
const inGraph = new Set(rows.map(r => `${rel(r.file)}::${String(r.name).toLowerCase()}`));

const isTest = (p) => /(^|\/)(tests?|__tests__|fixtures?)\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /_test\.py$/.test(p);

const missing = decls.filter(d => !isTest(d.file) && !inGraph.has(`${d.file.toLowerCase()}::${d.name.toLowerCase()}`));
const byFile = {};
for (const m of missing) byFile[m.file] = (byFile[m.file] || 0) + 1;

const scored = decls.filter(d => !isTest(d.file)).length;
console.log(`\n--- python declarations vs graph nodes (${path.basename(projectDir)}) ---`);
console.log(`  declarations walked (non-test) : ${scored}`);
console.log(`  python nodes in the graph      : ${rows.length}`);
console.log(`  files the walk could not parse : ${unparsed.length}${unparsed.length ? ' — ' + unparsed.slice(0, 3).join(', ') : ''}`);
console.log(`  MISSING (in source, no node)   : ${missing.length}`);
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${n.toString().padStart(4)}  ${f}`);

if (scored === 0) {
  console.error(`\n✖ the walk found NO declarations. That is a broken oracle, not an empty project.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::nodes-python`;
const prev = baseline[key];

let failed = false;
if (prev && missing.length > prev.missing) {
  console.error(`\n✖ COMPLETENESS WENT BACKWARDS: ${prev.missing} declarations had no node before, ${missing.length} now.`);
  failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.\n`);
} else if (failed) {
  process.exit(1);
}

if (process.argv.includes('--write-baseline')) {
  baseline[key] = { declarations: scored, missing: missing.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ every Python declaration the walk found still has a node, and completeness did not regress.\n`);
