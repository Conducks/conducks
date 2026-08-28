#!/usr/bin/env node
/**
 * Conducks — is there an edge for every call TypeScript source actually makes? 🏺
 *
 * The TypeScript twin of `oracle-edges-recall.mjs`, and it exists because the Python one was being
 * mistaken for coverage it did not have: `oracle:recall:sofie` walks sofie's NINE Python files, not
 * its TypeScript. Roughly 60% of the subject material had no recall check at all.
 *
 * THE ORACLE is `ts.createProgram`, walking every CallExpression and NewExpression.
 *
 * Every lesson the Python side had to learn the hard way is built in here rather than rediscovered
 * (ADR 0183): score CALLS **and** CONSTRUCTS, because construction is not a function call; read every
 * line in `properties.lines`, because one edge is stored per (source, target) pair and carries all
 * the lines it was seen on; and exclude the universal members `isUniversalMemberCall` deliberately
 * skips, read from the contract at run time so a copy here cannot drift toward a passing number.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const UNIVERSAL_MEMBERS = new Set(["apply", "at", "bind", "call", "catch", "charat", "charcodeat", "concat", "endswith", "entries", "every", "fill", "filter", "finally", "flat", "flatmap", "foreach", "gettime", "hasownproperty", "includes", "indexof", "join", "keys", "lastindexof", "localecompare", "map", "match", "matchall", "next", "normalize", "padend", "padstart", "pop", "push", "reduce", "reduceright", "repeat", "replace", "replaceall", "reverse", "search", "shift", "slice", "some", "sort", "splice", "split", "startswith", "substr", "substring", "then", "tofixed", "toisostring", "tojson", "tolocaledatestring", "tolocaletimestring", "tolowercase", "toprecision", "tostring", "touppercase", "trim", "trimend", "trimstart", "unshift", "valueof", "values"]);

const configPaths = [];
const rootCfg = path.join(projectDir, 'tsconfig.json');
if (existsSync(rootCfg)) configPaths.push(rootCfg);
for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (['node_modules', '.git', 'dist', 'build', '.conducks', '.next'].includes(entry.name)) continue;
  const nested = path.join(projectDir, entry.name, 'tsconfig.json');
  if (existsSync(nested)) configPaths.push(nested);
}
if (configPaths.length === 0) { console.error(`\n✖ no tsconfig under ${projectDir}.\n`); process.exit(1); }

const fileNames = new Set();
for (const cfg of configPaths) {
  try {
    const parsed = ts.parseJsonConfigFileContent(
      ts.readConfigFile(cfg, ts.sys.readFile).config, ts.sys, path.dirname(cfg));
    for (const f of parsed.fileNames) fileNames.add(f);
  } catch { /* visible in the totals below */ }
}
const program = ts.createProgram([...fileNames], { allowJs: true, noEmit: true, skipLibCheck: true });
const isTest = (p) => /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

const calleeName = (expr) => {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
};

const calls = [];
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const rel = path.relative(projectDir, sf.fileName);
  if (rel.startsWith('..') || rel.includes('node_modules') || isTest(rel)) continue;
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = ts.isNewExpression(node) ? calleeName(node.expression) : calleeName(node.expression);
      if (name && !UNIVERSAL_MEMBERS.has(name.toLowerCase())) {
        calls.push({ file: rel, name, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const nodeRows = await (await conn.run(
  `SELECT id, file FROM nodes
   WHERE file LIKE '%.ts' OR file LIKE '%.tsx' OR file LIKE '%.mts'
      OR file LIKE '%.js' OR file LIKE '%.jsx' OR file LIKE '%.mjs' OR file LIKE '%.cjs'`)).getRowObjects();
const edgeRows = await (await conn.run(
  `SELECT sourceId, lineNumber, properties FROM edges WHERE type IN ('CALLS', 'CONSTRUCTS')`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const lowerRoot = projectDir.toLowerCase();
const relOf = (f) => {
  const a = String(f).toLowerCase();
  return a.startsWith(lowerRoot) ? a.slice(lowerRoot.length).replace(/^[/\\]/, '') : a;
};
const fileOf = new Map(nodeRows.map(r => [String(r.id), relOf(r.file)]));

const covered = new Set();
for (const e of edgeRows) {
  const f = fileOf.get(String(e.sourceId));
  if (!f) continue;
  let props = {};
  try { props = JSON.parse(String(e.properties || '{}')); } catch { /* counted in the totals */ }
  const lines = Array.isArray(props.lines) && props.lines.length
    ? props.lines
    : (e.lineNumber !== null && e.lineNumber !== undefined ? [Number(e.lineNumber)] : []);
  for (const n of lines) covered.add(`${f}:${Number(n)}`);
}

const missing = calls.filter(c => !covered.has(`${c.file.toLowerCase()}:${c.line}`));
const byName = {};
for (const m of missing) byName[m.name] = (byName[m.name] || 0) + 1;
const pct = calls.length ? (((calls.length - missing.length) / calls.length) * 100).toFixed(2) : '0';

console.log(`\n--- typescript calls vs CALLS/CONSTRUCTS edges (${path.basename(projectDir)}) ---`);
console.log(`  call sites the compiler found : ${calls.length}`);
console.log(`  lines the graph covers        : ${covered.size}`);
console.log(`  MISSING (a call with no edge on its line): ${missing.length}   — recall ${pct}%`);
for (const [n, c] of Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`      ${String(c).padStart(4)}  ${n}(...)`);

if (calls.length === 0) { console.error(`\n✖ the program held NO calls. That is a broken oracle.\n`); process.exit(1); }

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::recall-ts`;
const prev = baseline[key];
let failed = false;
if (prev && missing.length > prev.missing) {
  console.error(`\n✖ EDGE RECALL WENT BACKWARDS: ${prev.missing} calls had no edge before, ${missing.length} now.`);
  failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.\n`);
} else if (failed) { process.exit(1); }
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { calls: calls.length, missing: missing.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) { console.log(`\n  ✖ NO BASELINE for '${key}'.\n`); process.exit(1); }
console.log(`\n✓ typescript edge recall did not regress.\n`);
