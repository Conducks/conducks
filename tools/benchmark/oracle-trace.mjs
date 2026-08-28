#!/usr/bin/env node
/**
 * Conducks — score `trace` reachability against an independent walk of the stored graph. 🏺
 *
 * WHY IT IS INDEPENDENT DESPITE SHARING THE GRAPH. `trace` IS a traversal — that is the whole of
 * what it does — so the thing under test is the walk, not the edges. This reads the vault's `edges`
 * table directly and does its own BFS, which is a different implementation of the same question.
 * Sharing the graph would only be circular for a tool that BUILDS it; `prune`'s oracles are the ones
 * that must stay outside.
 *
 * THE CLAIM BEING TESTED, exactly as `trace` words it: the ids reachable downstream, EXCEPT those a
 * walk reaches only through containment — "a step entered through MEMBER_OF is location, not
 * dependency". So a node whose every incoming edge from the reachable set is MEMBER_OF is expected
 * to be absent, and scoring it as a miss would fail the tool for a claim it never made.
 *
 * WHAT IT CANNOT SEE, stated rather than found out later:
 *   - whether the GRAPH is right. A missing edge is invisible here and is prune's and impact's
 *     oracles' business.
 *   - ordering. `trace` returns nearest-first by weighted distance and explicitly disclaims any
 *     execution order (ADR 0066), so order is not scored.
 *
 * WHERE THE TWO RULES GENUINELY DIFFER, and why MISSED is ratcheted rather than required to be zero.
 * This oracle admits a node reached by a real edge from anywhere in ITS OWN walk. `trace` requires
 * the referrer to have been KEPT — so a method whose only callers are themselves reachable only
 * through containment stays out. Measured on scraper: 20 nodes across 5 entry points, every one a
 * class member like `hands._annotate_groups`. trace's rule is the defensible one; this one is
 * simpler to state, so the gap is recorded rather than argued away.
 *
 * EXTRA is the hard gate and is exact: a node trace claims to reach and no walk can reach is wrong
 * with no judgement required.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');
const DEPTH = 99;   // above any real graph distance, so the DEPTH bound is not what is being scored

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const edgeRows = await (await conn.run(`SELECT sourceId, targetId, type FROM edges`)).getRowObjects();
// CLOSE BEFORE SPAWNING. The vault takes one connection at a time, so holding this open while the
// CLI runs makes every `trace` below fail with "Vault Locked" — the oracle blocking the tool it is
// trying to measure. Edges are already in memory by here.
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* best effort — the read is done */ }

const out = new Map(), incoming = new Map();
for (const r of edgeRows) {
  const s = String(r.sourceId), t = String(r.targetId), ty = String(r.type);
  if (!out.has(s)) out.set(s, []);
  out.get(s).push({ to: t, type: ty });
  if (!incoming.has(t)) incoming.set(t, []);
  incoming.get(t).push({ from: s, type: ty });
}

/** Everything reachable downstream, by our own walk. */
function reachable(startId) {
  const seen = new Set([startId]); const q = [startId];
  while (q.length) {
    const cur = q.shift();
    for (const e of (out.get(cur) || [])) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
  }
  seen.delete(startId);
  return seen;
}

/** trace's own exclusion: reached ONLY through containment, from inside the reachable set. */
const containmentOnly = (id, set) => {
  const from = (incoming.get(id) || []).filter(e => set.has(e.from) || e.from === id);
  // AT LEAST ONE, then all of them. `[].every()` is true, so a node whose only incoming edges come
  // from OUTSIDE the walk was called containment-only — vacuously. That reported `ecosystem::uvicorn`
  // and two others as trace breaking its own rule on a correct build, which is the direction of
  // wrongness that looks like rigour.
  return from.length > 0 && from.every(e => e.type === 'MEMBER_OF');
};

function traceOf(startId) {
  const raw = execFileSync('node', [CLI, 'trace', startId, '--depth', String(DEPTH), '--limit', '100000', '--json'],
    { cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(raw);
}

// Score the heaviest entry points — the traces most likely to expose a traversal bug.
const entryRaw = execFileSync('node', [CLI, 'entry', '--json'], { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const entries = (JSON.parse(entryRaw).entryPoints ?? JSON.parse(entryRaw) ?? []).slice(0, 5);

let missedTotal = 0, extraTotal = 0, containmentTotal = 0, scored = 0;
const rows = [];
for (const e of entries) {
  const id = e.id ?? e.symbolId;
  if (!id) continue;
  const mine = reachable(String(id).toLowerCase());
  if (mine.size === 0) continue;
  const theirs = new Set(traceOf(id).steps.map(s => s.id));
  // THE START COUNTS AS A REFERRER. `reachable()` removes the start from its own result — correct
  // for "what does this reach" — but the containment check then could not see an edge FROM the start,
  // so a node the start itself calls looked as though only containment pointed at it. On scraper
  // `recorder.py::instrument` is CALLED by `mcp_server.py::unit`, which is one of the five starts.
  const withStart = new Set([...mine, String(id).toLowerCase()]);
  const missed = [...mine].filter(x => !theirs.has(x) && !containmentOnly(x, withStart));
  const extra = [...theirs].filter(x => !mine.has(x));
  // THE RULE, SCORED IN THE OTHER DIRECTION. `containmentOnly` was used only to EXCUSE a node from
  // MISSED, so removing trace's MEMBER_OF filter altogether changed nothing here and the rule was
  // guarded by nothing at all — not this oracle, not the benchmark, not a test. A node trace RETURNS
  // whose every incoming edge from the reachable set is containment is trace breaking its own claim:
  // "a step entered through MEMBER_OF is location, not dependency".
  const containmentClaimed = [...theirs].filter(x => mine.has(x) && containmentOnly(x, withStart));
  rows.push({ id: String(id).split('/').pop(), mine: mine.size, theirs: theirs.size, missed: missed.length, extra: extra.length, containment: containmentClaimed.length });
  missedTotal += missed.length; extraTotal += extra.length; containmentTotal += containmentClaimed.length; scored++;
  for (const c of containmentClaimed.slice(0, 3)) console.log(`      CONTAINMENT-ONLY ${c.slice(-70)}`);
  for (const m of missed.slice(0, 3)) console.log(`      MISSED ${m.slice(-70)}`);
  for (const x of extra.slice(0, 3)) console.log(`      EXTRA  ${x.slice(-70)}`);
}

console.log(`\n--- trace reachability vs an independent walk (${path.basename(projectDir)}) ---`);
for (const r of rows) console.log(`  ${r.id.padEnd(28)} walk ${String(r.mine).padStart(5)}  trace ${String(r.theirs).padStart(5)}  missed ${r.missed}  extra ${r.extra}`);
console.log(`  starts scored : ${scored}`);
console.log(`  MISSED (walk reaches it by a real edge, trace silent): ${missedTotal}`);
console.log(`  EXTRA  (trace claims it, the walk cannot reach it)   : ${extraTotal}`);
console.log(`  CONTAINMENT-ONLY (trace returned it, reached only via MEMBER_OF): ${containmentTotal}`);

if (scored === 0) {
  console.error(`\n✖ no start point produced a reachable set. That is a broken oracle, not a small graph.\n`);
  process.exit(1);
}

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::trace`;
const prev = baseline[key];

let failed = false;
if (extraTotal > 0) { console.error(`\n✖ ${extraTotal} node(s) trace claims are reachable and the walk cannot reach.`); failed = true; }
// A GATE, at zero, and it took finding the bug in this check to earn that.
//
// It shipped as a ratchet against 24 / 41 / 22 because those numbers looked like a disagreement
// between trace's rule (the shortest path's last edge, then re-admission) and this one (incoming
// edges). They were not. `reachable()` deletes the START from its own result — correct for "what does
// this reach" — so the check could not see an edge FROM the start, and a node the start itself CALLS
// looked as though only containment pointed at it. On scraper, `recorder.py::instrument` is called by
// `mcp_server.py::unit`, which is one of the five starts.
//
// With the start counted as a referrer the number is 0 on all three subjects, and removing trace's
// MEMBER_OF filter takes scraper to 276. That is a gate: it is zero when the rule holds and large
// when it does not.
if (containmentTotal > 0) {
  console.error(`\n✖ ${containmentTotal} node(s) trace returned that are reached ONLY through containment — its own rule refuses these.`);
  failed = true;
}
if (prev && missedTotal > prev.missed) {
  console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missedTotal} now.`); failed = true;
}
// `--write-baseline` OVERRIDES a failing ratchet, deliberately.
//
// ADR 0044's rule is that a baseline must never be recorded SILENTLY — it is not that a number can
// never be re-recorded. Those differ, and the difference matters when the ORACLE changes rather than
// the tool: fixing a vacuous-truth bug in `containmentOnly` stopped excusing one node, MISSED moved
// 20 -> 21 with trace untouched, and the gate would otherwise have been unfixable without editing
// the JSON by hand — which is exactly the silent path the rule forbids.
//
// It says so out loud when it does it.
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.`);
  console.error(`    Do this only when the ORACLE changed. If the TOOL changed, fix the tool.\n`);
} else if (failed) {
  process.exit(1);
}

// A MISSING BASELINE IS NOT A PASS (ADR 0044) — the same rule every other oracle here keeps.
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { starts: scored, missed: missedTotal, containment: containmentTotal };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ trace claims nothing the walk cannot reach, and recall did not regress.\n`);
