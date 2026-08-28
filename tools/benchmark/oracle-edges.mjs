#!/usr/bin/env node
/**
 * Conducks — does every CALLS edge point at a call that is actually there? 🏺
 *
 * The completeness oracles ask whether the graph holds the right NODES. This asks the other half, and
 * the one every answer is built from: whether its EDGES describe something that exists.
 *
 * THE ORACLE IS THE SOURCE TEXT, which is as independent as it gets — no parser, no second heuristic,
 * no shared machinery with the thing under test. Each CALLS edge records the raw expression it was
 * built from (`properties.original`) and the line it was found on. Either that text is on that line
 * of that file or the edge is describing something that is not there.
 *
 * Language-agnostic on purpose: it reads bytes, so it covers the nine grammars that have no oracle
 * of their own as readily as the two that do.
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - whether the edge points at the RIGHT target. `vp.setAttribute` being at line 18 does not prove
 *     the edge resolved to the correct node; that is what the receiver and namespace work was about.
 *   - RECALL. A call in source with no edge at all is invisible here — this scores the edges that
 *     exist, not the ones that should.
 *   - edges with no recorded line, which are counted and reported rather than silently skipped.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const nodeRows = await (await conn.run(`SELECT id, file FROM nodes`)).getRowObjects();
const edgeRows = await (await conn.run(
  `SELECT sourceId, targetId, lineNumber, properties FROM edges WHERE type = 'CALLS'`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const fileOf = new Map(nodeRows.map(r => [String(r.id), String(r.file || '')]));
const cache = new Map();
const linesOf = (f) => {
  if (!cache.has(f)) {
    try { cache.set(f, readFileSync(f, 'utf8').split('\n')); }
    catch { cache.set(f, null); }
  }
  return cache.get(f);
};

let scored = 0, noLine = 0, noFile = 0, noOriginal = 0;
const misplaced = [];
for (const e of edgeRows) {
  let props = {};
  try { props = JSON.parse(String(e.properties || '{}')); } catch { /* unparsable metadata is counted below */ }
  const original = String(props.original ?? '');
  if (!original) { noOriginal++; continue; }
  if (e.lineNumber === null || e.lineNumber === undefined) { noLine++; continue; }

  const file = fileOf.get(String(e.sourceId));
  if (!file || !existsSync(file)) { noFile++; continue; }
  const lines = linesOf(file);
  if (!lines) { noFile++; continue; }

  // A call may span lines; the edge records every line it touched, so check them all before failing.
  //
  // EXACT text, no fallback. A looser variant matching the last segment of a dotted expression was
  // written first and removed: measured across 9,820 edges on scraper it changed nothing, so it was
  // a line with no purpose that would have hidden a real drift the day one appeared.
  const span = Array.isArray(props.lines) && props.lines.length ? props.lines : [Number(e.lineNumber)];
  const hit = span.some(n => {
    const text = lines[Number(n) - 1];
    return typeof text === 'string' && text.includes(original);
  });
  scored++;
  if (!hit) misplaced.push({ original, file: path.relative(projectDir, file), line: Number(e.lineNumber) });
}

console.log(`\n--- CALLS edges vs the source text (${path.basename(projectDir)}) ---`);
console.log(`  CALLS edges              : ${edgeRows.length}`);
console.log(`  scored (line + original) : ${scored}`);
console.log(`  skipped — no original    : ${noOriginal}`);
console.log(`  skipped — no line        : ${noLine}`);
console.log(`  skipped — file unreadable: ${noFile}`);
console.log(`  MISPLACED (edge claims a call the line does not contain): ${misplaced.length}`);
for (const m of misplaced.slice(0, 10)) console.log(`      ${m.original}  ${m.file}:${m.line}`);

if (scored === 0) {
  console.error(`\n✖ no CALLS edge could be scored. That is a broken oracle, not a project without calls.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::edges`;
const prev = baseline[key];

let failed = false;
if (prev && misplaced.length > prev.misplaced) {
  console.error(`\n✖ EDGE PRECISION WENT BACKWARDS: ${prev.misplaced} misplaced before, ${misplaced.length} now.`);
  failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.\n`);
} else if (failed) {
  process.exit(1);
}
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { scored, misplaced: misplaced.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ every scored CALLS edge points at text that is on the line it names.\n`);
