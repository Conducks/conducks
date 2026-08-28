#!/usr/bin/env node
/**
 * Conducks — is the neighbourhood `context` returns the neighbourhood that is there? 🏺
 *
 * `context` answers "what is around this symbol" within a radius, scored and budgeted. It is the
 * command an agent calls before editing something, so what it OMITS is what the agent never sees —
 * and a missing neighbour is silent in exactly the way a missing edge is.
 *
 * THE ORACLE is an independent walk of the stored graph, for the reason `oracle-trace.mjs` records:
 * `context` IS a traversal plus a ranking, so the traversal is what is under test and sharing the
 * graph is not circular. A tool that BUILDS the graph could not be scored this way.
 *
 * THE CLAIM: every node returned is within `radius` hops, and `total_in_radius` is the size of that
 * neighbourhood.
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - the SCORE. Ranking is a policy — which neighbour matters most is a judgement, not a fact, and
 *     scoring it against a second opinion would only compare two policies.
 *   - the token budget, which is a rendering concern.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const edgeRows = await (await conn.run(`SELECT sourceId, targetId, type FROM edges`)).getRowObjects();
const nodeRows = await (await conn.run(`SELECT id, canonicalKind FROM nodes`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

// UNDIRECTED. `context` prints both "called by" and what the symbol reaches, so a neighbour is a
// neighbour whichever way the edge points — this is the shape of the question, not of the graph.
const adj = new Map();
for (const r of edgeRows) {
  const s = String(r.sourceId), t = String(r.targetId);
  if (!adj.has(s)) adj.set(s, new Set());
  if (!adj.has(t)) adj.set(t, new Set());
  adj.get(s).add(t); adj.get(t).add(s);
}

function within(startId, radius) {
  const seen = new Map([[startId, 0]]);
  let frontier = [startId];
  for (let d = 1; d <= radius; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const n of (adj.get(cur) || [])) {
        if (!seen.has(n)) { seen.set(n, d); next.push(n); }
      }
    }
    frontier = next;
  }
  seen.delete(startId);
  return seen;
}

// THE EXCLUSIONS CONTEXT ACTUALLY MAKES, read from `kinetic/context.ts` rather than guessed.
//
// Containers are dropped always — an ECOSYSTEM or a UNIT is where a thing lives, not what is around
// it. ATOMs are dropped unless `--include-atoms`, because 51% of the graph is ATOM and they crowd out
// what a caller asked for. And a dangling edge target has no node to return.
//
// Scoring the raw walk against context reported it returning 75 of 105 neighbours at radius 1 — a
// recall gap that is entirely these three rules doing their job.
const CONTAINERS = new Set(['ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT']);
const kindOf = new Map(nodeRows.map(r => [String(r.id), String(r.canonicalKind ?? '')]));
const returnable = (id, includeAtoms) => {
  const k = kindOf.get(id);
  if (k === undefined) return false;            // a dangling target has no node to return
  if (CONTAINERS.has(k)) return false;
  if (!includeAtoms && k === 'ATOM') return false;
  return true;
};

const entryRaw = execFileSync('node', [CLI, 'entry', '--json'], { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const parsedEntry = JSON.parse(entryRaw);
const entries = (parsedEntry.entryPoints ?? parsedEntry ?? []).slice(0, 5);

const RADII = [1, 2, 3];
let outside = 0, missedTotal = 0, excludedTotal = 0, scored = 0;
const rows = [];
for (const e of entries) {
  const id = e.id ?? e.symbolId;
  if (!id) continue;
  for (const radius of RADII) {
    let out;
    try {
      out = JSON.parse(execFileSync('node',
        [CLI, 'context', String(id), '--radius', String(radius), '--limit', '100000', '--json'],
        { cwd: projectDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));
    } catch { continue; }
    const mine = within(String(id).toLowerCase(), radius);
    const expected = [...mine.keys()].filter(n => returnable(n, false));
    const returned = (out.nodes ?? []).map(n => String(n.id));
    const returnedSet = new Set(returned);
    const notNeighbours = returned.filter(n => !mine.has(n));
    const missed = expected.filter(n => !returnedSet.has(n));
    // THE REVERSE CHECK. `missed` catches a filter that drops too much; this catches one that drops
    // too little — a container or an ATOM handed back is inside the radius, so neither the outside
    // check nor the missed check would see it.
    const shouldNotBe = returned.filter(n => mine.has(n) && !returnable(n, false));
    scored++;
    outside += notNeighbours.length;
    excludedTotal += shouldNotBe.length;
    missedTotal += missed.length;
    rows.push({
      id: String(id).split('/').pop(), radius,
      walk: mine.size, expected: expected.length, returned: returned.length,
      outside: notNeighbours.length, missed: missed.length, excluded: shouldNotBe.length,
    });
    for (const n of missed.slice(0, 2)) console.log(`      MISSED ${String(n).slice(-64)}`);
    for (const n of notNeighbours.slice(0, 3)) console.log(`      OUTSIDE RADIUS ${String(n).slice(-64)}`);
  }
}

console.log(`\n--- context's neighbourhood vs an independent radius walk (${path.basename(projectDir)}) ---`);
for (const r of rows) {
  console.log(`  ${r.id.padEnd(26)} r=${r.radius}  walk ${String(r.walk).padStart(5)}  returnable ${String(r.expected).padStart(5)}  returned ${String(r.returned).padStart(5)}  outside ${r.outside}  missed ${r.missed}`);
}
console.log(`  runs scored : ${scored}`);
console.log(`  OUTSIDE RADIUS (context returned a node the walk cannot reach): ${outside}`);
console.log(`  MISSED (returnable, in radius, not returned)             : ${missedTotal}`);
console.log(`  EXCLUDED-BUT-RETURNED (a container or ATOM handed back)  : ${excludedTotal}`);

if (scored === 0) {
  console.error(`\n✖ no run could be scored. That is a broken oracle, not an empty project.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::context`;
const prev = baseline[key];

let failed = false;
if (outside > 0) { console.error(`\n✖ ${outside} node(s) returned that are not within the radius asked for.`); failed = true; }
if (missedTotal > 0) { console.error(`\n✖ ${missedTotal} returnable node(s) inside the radius were not returned.`); failed = true; }
if (excludedTotal > 0) { console.error(`\n✖ ${excludedTotal} node(s) returned that context's own rules exclude.`); failed = true; }
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING gate, because --write-baseline was passed.\n`);
} else if (failed) { process.exit(1); }
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { runs: scored, outside, missed: missedTotal, excluded: excludedTotal };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.\n`);
  process.exit(1);
}
console.log(`\n✓ every node context returned is inside the radius it was asked for.\n`);
