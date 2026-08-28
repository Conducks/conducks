#!/usr/bin/env node
/**
 * Conducks — does a TypeScript node's recorded line match the declaration? 🏺
 *
 * The TypeScript twin of `oracle-lines.mjs`, and it exists because the Python one was being mistaken
 * for coverage it did not have: `oracle:lines:sofie` walks sofie's NINE Python files, not its 1,452
 * TypeScript declarations. Roughly 60% of the subject material had no line check at all.
 *
 * THE ORACLE is `ts.createProgram` and `getLineAndCharacterOfPosition` — the compiler's own idea of
 * where a declaration starts.
 *
 * `getStart()` skips leading trivia, so a comment above a declaration does not move the line. That
 * matches what a reader means by "where is it", and it is the same anchor the Python side takes from
 * `ast`.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { buildProgram } from './ts-program.mjs';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();

// The file set is shared with the other TypeScript oracles — see `ts-program.mjs`. A tsconfig is the
// project's build story, not an inventory of its source, and three subjects each left JavaScript out
// of it a different way.
const built = buildProgram(projectDir);
if (!built) {
  console.error(`\n✖ no tsconfig and no JavaScript under ${projectDir}. Nothing to score.\n`);
  process.exit(1);
}
const { program, configPaths, fromConfig, jsAdded } = built;

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
    if (!name) continue;
    decls.push({ file: rel, name, line: sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1 });
  }
}

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const rows = await (await conn.run(
  `SELECT name, file, lineStart FROM nodes
   WHERE file LIKE '%.ts' OR file LIKE '%.tsx' OR file LIKE '%.mts'
      OR file LIKE '%.js' OR file LIKE '%.jsx' OR file LIKE '%.mjs' OR file LIKE '%.cjs'`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const lowerRoot = projectDir.toLowerCase();
const relOf = (f) => {
  const a = String(f).toLowerCase();
  return a.startsWith(lowerRoot) ? a.slice(lowerRoot.length).replace(/^[/\\]/, '') : a;
};
// Any recorded line for the name, for the reason the Python side records: a name may be declared more
// than once in a file, and asking WHICH occurrence a node is would be a stricter claim.
// CASE-SENSITIVE on the NAME. The graph preserves a symbol's spelling, and lowercasing the key
// collides declarations that differ only in case: `export type Verdict<T>` at contracts/verdict.ts:32
// and `export function verdict<T>` at :52 became one key, so the type was scored against the
// function's line and reported as a drift. Three of conducks' four "wrong" lines were this.
const lines = new Map();
for (const r of rows) {
  const k = `${relOf(r.file)}::${String(r.name)}`;
  if (!lines.has(k)) lines.set(k, new Set());
  if (r.lineStart !== null && r.lineStart !== undefined) lines.get(k).add(Number(r.lineStart));
}

let scored = 0, noNode = 0;
const wrong = [];
for (const d of decls) {
  const got = lines.get(`${d.file.toLowerCase()}::${d.name}`);
  if (!got || got.size === 0) { noNode++; continue; }
  scored++;
  if (!got.has(d.line)) wrong.push({ ...d, got: [...got].slice(0, 3) });
}

const pct = scored ? (((scored - wrong.length) / scored) * 100).toFixed(2) : '0';
console.log(`\n--- typescript declaration lines vs node lineStart (${path.basename(projectDir)}) ---`);
console.log(`  declarations scored        : ${scored}`);
console.log(`  skipped — no node for name : ${noNode}`);
console.log(`  WRONG LINE                 : ${wrong.length}`);
for (const w of wrong.slice(0, 10)) console.log(`      ${w.name}  ${w.file}  tsc ${w.line}, graph ${w.got.join('/')}`);
console.log(`  line accuracy              : ${pct}%`);

if (scored === 0) { console.error(`\n✖ nothing could be scored. That is a broken oracle.\n`); process.exit(1); }

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::lines-ts`;
const prev = baseline[key];
let failed = false;
if (prev && wrong.length > prev.wrong) {
  console.error(`\n✖ LINE ACCURACY WENT BACKWARDS: ${prev.wrong} wrong before, ${wrong.length} now.`);
  failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.\n`);
} else if (failed) { process.exit(1); }
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { scored, wrong: wrong.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.\n`);
  process.exit(1);
}
console.log(`\n✓ typescript line accuracy did not regress.\n`);
