#!/usr/bin/env node
/**
 * Conducks — does the graph hold a node for every TypeScript declaration in the source? 🏺
 *
 * The TypeScript half of `oracle-nodes-python.mjs`, and the one that covers the two biggest subjects.
 * `analyze` is the base of the octopus: a declaration with no node is invisible to `prune`, `trace`,
 * `impact` and `context` at once, and every one of them looks correct while missing it, because
 * absence is silent everywhere.
 *
 * THE ORACLE is the compiler's own parser — `ts.createProgram` over the project's tsconfigs, reading
 * each SourceFile's declarations. Not a regex, not a second heuristic: the same machinery `tsc` uses.
 *
 * THE CLAIM: every top-level function, class, interface, enum and type alias in a compiled file has a
 * node in the graph.
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - edges, which are prune's and trace's oracles.
 *   - nested declarations. A function inside a function is captured by conducks but its scoping rules
 *     are their own subject, and mixing them in would score two claims as one.
 *   - files outside the program. A file no tsconfig includes is not the compiler's business and not
 *     scored here — the same rule ADR 0176 had to learn for the import oracle.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();

const configPath = path.join(projectDir, 'tsconfig.json');
const configPaths = existsSync(configPath) ? [configPath] : [];
for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (['node_modules', '.git', 'dist', 'build', '.conducks', '.next'].includes(entry.name)) continue;
  const nested = path.join(projectDir, entry.name, 'tsconfig.json');
  if (existsSync(nested)) configPaths.push(nested);
}
if (configPaths.length === 0) {
  console.error(`\n✖ no tsconfig found under ${projectDir}. Nothing to score against.\n`);
  process.exit(1);
}

const fileNames = new Set();
for (const cfg of configPaths) {
  try {
    const parsed = ts.parseJsonConfigFileContent(
      ts.readConfigFile(cfg, ts.sys.readFile).config, ts.sys, path.dirname(cfg));
    for (const f of parsed.fileNames) fileNames.add(f);
  } catch { /* a config that cannot be read is visible in the coverage line below */ }
}
const program = ts.createProgram([...fileNames], { allowJs: true, noEmit: true, skipLibCheck: true });

const isTest = (p) => /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

const decls = [];
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const rel = path.relative(projectDir, sf.fileName);
  if (rel.startsWith('..') || rel.includes('node_modules') || isTest(rel)) continue;
  for (const st of sf.statements) {
    let name = null;
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) name = st.name?.text ?? null;
    else if (ts.isInterfaceDeclaration(st) || ts.isEnumDeclaration(st) || ts.isTypeAliasDeclaration(st)) name = st.name.text;
    if (name) decls.push({ file: rel, name });
  }
}

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
// EVERY EXTENSION THE PROGRAM COMPILES, not just the TypeScript ones. The program is built with
// `allowJs`, so it walks `.mjs` and `.js` too — and querying only `.ts*` reported 14 declarations in
// `scripts/qa/fixtures.mjs` as having no node when the graph held 24 for that file. An oracle whose
// two sides disagree about which files are in scope reports the difference as a defect in the tool.
const rows = await (await conn.run(
  `SELECT name, file FROM nodes
   WHERE file LIKE '%.ts' OR file LIKE '%.tsx' OR file LIKE '%.mts'
      OR file LIKE '%.js' OR file LIKE '%.jsx' OR file LIKE '%.mjs' OR file LIKE '%.cjs'`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const lowerRoot = projectDir.toLowerCase();
const rel = (f) => {
  const a = String(f).toLowerCase();
  return a.startsWith(lowerRoot) ? a.slice(lowerRoot.length).replace(/^[/\\]/, '') : a;
};
const inGraph = new Set(rows.map(r => `${rel(r.file)}::${String(r.name).toLowerCase()}`));
const missing = decls.filter(d => !inGraph.has(`${d.file.toLowerCase()}::${d.name.toLowerCase()}`));
const byFile = {};
for (const m of missing) byFile[m.file] = (byFile[m.file] || 0) + 1;

console.log(`\n--- typescript declarations vs graph nodes (${path.basename(projectDir)}) ---`);
console.log(`  tsconfigs read                 : ${configPaths.length}`);
console.log(`  declarations walked (non-test) : ${decls.length}`);
console.log(`  ts nodes in the graph          : ${rows.length}`);
console.log(`  MISSING (in source, no node)   : ${missing.length}`);
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${n.toString().padStart(4)}  ${f}`);

if (decls.length === 0) {
  console.error(`\n✖ the program held NO declarations. That is a broken oracle, not an empty project.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::nodes-ts`;
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
  baseline[key] = { declarations: decls.length, missing: missing.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ every TypeScript declaration the compiler found still has a node, and completeness did not regress.\n`);
