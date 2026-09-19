#!/usr/bin/env node
/**
 * Conducks — does `drift` reach the verdict its own rules reach? 🕵️‍♂️
 *
 * `drift` answers "is this architecture decaying", and its answer is a WORD — STABLE, DECAYING,
 * INSUFFICIENT_DATA — which is exactly what makes it dangerous. A wrong number invites a second
 * look; a wrong "stable" ends the conversation. Two states used to collapse into STABLE and both
 * read as good news: a query that threw, and a pair of pulses with nothing comparable between them
 * (this repository's own vault: 70 pulses, 0 rows in node_history, verdict "stable across 0
 * symbols"). The engine's own comments record it.
 *
 * THE CLAIM, quoted from `src/lib/domain/evolution/drift-engine.ts`:
 *
 *   "Compares the current pulse against a previous one. If pulseId is not provided, uses the two
 *    most recent pulses."
 *
 * and, in code:
 *   comparable   node ids in BOTH pulses' node_history AND still present in `nodes`
 *   velocity     (Δgravity * 0.5) + (Δcomplexity * 0.5)
 *   identityGap  either fingerprint NULL — "the row was not checked for a structural shift, it
 *                could not be"; never read isModified === false as confirmed unchanged
 *   isModified   both fingerprints present and different
 *   deltas       comparable rows where |velocity| > 0.001 || isModified || identityGap
 *   decay        velocity >  DECAY_VELOCITY_THRESHOLD (0.05)
 *   improvement  velocity <  IMPROVEMENT_VELOCITY_THRESHOLD (-0.05)
 *   moves        symbols that APPEARED paired 1:1 with symbols that VANISHED, matched on
 *                COALESCE(shape_fingerprint, fingerprint), greedy on closest gravity then id
 *   status       UNAVAILABLE if a query threw; INSUFFICIENT_DATA if nothing was comparable and no
 *                move was found; DECAYING if any velocity clears the threshold; else STABLE
 *
 * THE ORACLE re-derives that by a DIFFERENT MECHANISM. `drift` asks DuckDB to do the work: a
 * self-join on node_history for the deltas, and a second self-join with two `NOT IN` subqueries for
 * the renames. This oracle pulls the raw per-pulse rows and computes everything in plain JavaScript
 * with Maps and Sets. The interesting half is the rename pairing, where SQL and JS genuinely differ:
 * in SQL a NULL fingerprint joins to NOTHING, including another NULL, while a JavaScript `Map`
 * keyed on `null` would happily group every fingerprint-less symbol into one bucket and invent
 * renames by the dozen. The oracle has to re-derive that NULL rule deliberately, which is precisely
 * why it is a second opinion and not a transcription.
 *
 * It scores FOUR directions:
 *   SUMMARY      every field of `summary` — total_symbols, decay_count, improvement_count,
 *                move_count, identity_gap_count — against the JavaScript recount
 *   STATUS       the verdict word, recomputed from the oracle's own counts
 *   MOVES        every reported from→to pair against the oracle's own 1:1 pairing. A rename it
 *                invented and a rename it missed are scored separately, because the measured bugs
 *                went both ways: N*M fabricated pairs from a many-to-many join, and zero pairs for
 *                a renamed leaf function
 *   VELOCITY     for each delta row `drift` actually printed, the velocity and isModified it printed
 *                against the ones the recount gives
 *   MESSAGE      the numbers INSIDE the printed sentence against the summary printed beside them —
 *                the todo26 defect was two thresholds under one word, 3 and 153 on the same screen
 *
 * WHAT IT DOES NOT TEST, stated rather than discovered later:
 *   - WHETHER THE THRESHOLD IS THE RIGHT THRESHOLD. 0.05 is a policy. Scoring a policy against a
 *     second opinion compares two policies. What is scored is that ONE threshold serves both the
 *     sentence and the summary — the todo26 defect where 3 and 153 were printed on the same screen.
 *   - THE `UNAVAILABLE` PATH, which requires the vault query to throw. Nothing here can make it
 *     throw without editing the code, so that branch is unscored by this file — L2 cannot reach it
 *     either, and only a mutation can.
 *   - WHICH rename is which INSIDE a group of identical-shape symbols. The engine says so itself:
 *     "same shape, same metrics, different names is all the graph knows", so an individual from→to
 *     in such a group is a documented guess. The oracle replicates the same deterministic tie-break
 *     and therefore CANNOT catch a wrong guess — only a wrong COUNT.
 *   - DELTA ROWS PAST THE FIRST 10. `drift --json` truncates `deltas` to 10 (and says so with
 *     `truncated`). The counts it is scored on are untruncated; the per-row velocity check only
 *     covers the rows it printed.
 *   - THE RENDERED OUTPUT. Only `--json` is read. The human text is scored by `bench-drift.mjs`
 *     for the one property that matters — that the sentence agrees with the summary.
 *
 * CORPUS NOTE, and it is a finding rather than an aside: `drift` compares two pulses, so a vault
 * with one pulse cannot be scored. Every subject vault under ../test-projects holds exactly ONE.
 * Point this at a repository analyzed twice, with a change between.
 *
 *   node tools/benchmark/oracle-drift.mjs <projectDir>
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const DECAY = 0.05;        // DECAY_VELOCITY_THRESHOLD, src/contracts/scoring.ts
const IMPROVE = -DECAY;    // IMPROVEMENT_VELOCITY_THRESHOLD

const positional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positional ? path.resolve(positional) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

// READ_ONLY on purpose: an oracle must not be able to mutate the thing it is scoring, and
// subject vaults are shared with other runs. A scorer that can write is not a second opinion.
const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'), { access_mode: 'READ_ONLY' });
const conn = await db.connect();
const rowsOf = async (sql) => (await (await conn.run(sql)).getRowObjects());

const pulses = await rowsOf(`SELECT id FROM pulses ORDER BY timestamp DESC`);
if (pulses.length < 2) {
  console.error(`drift-oracle CANNOT RUN on ${projectDir}: the vault holds ${pulses.length} pulse(s).`);
  console.error(`  \`drift\` compares two pulses. One pulse is not a corpus for it — and this is the`);
  console.error(`  state every subject vault is in. Analyze the project twice, with a change between.`);
  process.exit(1);
}
const CUR = String(pulses[0].id);
const PREV = String(pulses[1].id);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Raw rows only — every rule below is re-derived in JavaScript, not asked of the database.
const hist = await rowsOf(`
  SELECT pulseId, nodeId, CAST(gravity AS DOUBLE) AS gravity, complexity, fingerprint, shape_fingerprint
  FROM node_history WHERE pulseId IN (${q(CUR)}, ${q(PREV)})`);
const nodeIds = new Set((await rowsOf(`SELECT id FROM nodes`)).map(r => String(r.id)));
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const cur = new Map(), prev = new Map();
for (const r of hist) (String(r.pulseId) === CUR ? cur : prev).set(String(r.nodeId), r);

/** The exact-match half: in both pulses AND still in `nodes` — the engine's `JOIN nodes n`. */
const comparable = [...cur.keys()].filter(id => prev.has(id) && nodeIds.has(id));
const deltas = comparable.map(id => {
  const c = cur.get(id), p = prev.get(id);
  const gDelta = Number(c.gravity ?? 0) - Number(p.gravity ?? 0);
  const cDelta = Number(c.complexity ?? 0) - Number(p.complexity ?? 0);
  const identityGap = c.fingerprint == null || p.fingerprint == null;
  return {
    id, identityGap,
    isModified: !identityGap && c.fingerprint !== p.fingerprint,
    velocity: (gDelta * 0.5) + (cDelta * 0.5),
  };
}).filter(d => Math.abs(d.velocity) > 0.001 || d.isModified || d.identityGap);

/**
 * The rename half, re-derived without SQL.
 *
 * A NULL shape key joins to nothing in SQL — not even to another NULL — so a fingerprint-less
 * symbol can never be a rename end. Written out here on purpose: a Map keyed on `null` would bucket
 * every UNIT node together (UNITs are fingerprint-less by design) and fabricate renames wholesale.
 */
const shape = (r) => r.shape_fingerprint ?? r.fingerprint ?? null;
const appeared = [...cur.keys()].filter(id => !prev.has(id) && nodeIds.has(id));
const vanished = [...prev.keys()].filter(id => !cur.has(id));
const candidates = [];
for (const a of appeared) {
  const ka = shape(cur.get(a));
  if (ka == null) continue;
  for (const v of vanished) {
    if (shape(prev.get(v)) !== ka) continue;
    candidates.push({ to: a, from: v, cost: Math.abs(Number(cur.get(a).gravity ?? 0) - Number(prev.get(v).gravity ?? 0)) });
  }
}
// Same deterministic rule the engine states: closest gravity first, ties on id, no id spent twice.
const usedTo = new Set(), usedFrom = new Set();
const oracleMoves = candidates
  .sort((a, b) => (a.cost - b.cost) || a.to.localeCompare(b.to) || a.from.localeCompare(b.from))
  .filter(m => (usedTo.has(m.to) || usedFrom.has(m.from)) ? false : (usedTo.add(m.to), usedFrom.add(m.from), true));

const oracleSummary = {
  total_symbols: comparable.length,
  decay_count: deltas.filter(d => d.velocity > DECAY).length,
  improvement_count: deltas.filter(d => d.velocity < IMPROVE).length,
  move_count: oracleMoves.length,
  identity_gap_count: deltas.filter(d => d.identityGap).length,
};
const oracleStatus =
  (comparable.length === 0 && oracleMoves.length === 0) ? 'INSUFFICIENT_DATA'
  : oracleSummary.decay_count > 0 ? 'DECAYING'
  : 'STABLE';

// A comparison over nothing is not a comparison (ADR 0044) — and it is the exact state that once
// printed "stable across 0 symbols".
if (comparable.length === 0 && oracleMoves.length === 0) {
  console.error(`drift-oracle FAILED: nothing was comparable between ${PREV} and ${CUR} in ${projectDir}.`);
  console.error(`  A verdict over zero symbols is not a verdict, and scoring one is not a check.`);
  process.exit(1);
}

const raw = execFileSync('node', [CLI, 'drift', '--json'], {
  cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
});
const actual = JSON.parse(raw.slice(raw.indexOf('{')));

const summaryMismatch = [];
for (const k of Object.keys(oracleSummary)) {
  const a = Number(actual.summary?.[k]);
  if (a !== oracleSummary[k]) summaryMismatch.push(`${k}: drift=${a} oracle=${oracleSummary[k]}`);
}
const statusMismatch = String(actual.status) !== oracleStatus
  ? [`status: drift=${actual.status} oracle=${oracleStatus}`] : [];

const key = (m) => `${m.from} → ${m.to}`;
const actualMoveSet = new Set((actual.moves ?? []).map(m => `${String(m.from)} → ${String(m.to)}`));
const oracleMoveSet = new Set(oracleMoves.map(key));
const movesInvented = [...actualMoveSet].filter(k => !oracleMoveSet.has(k));
const movesMissed = [...oracleMoveSet].filter(k => !actualMoveSet.has(k));

const EPS = 1e-9;
const byId = new Map(deltas.map(d => [d.id, d]));
const velocityMismatch = [];
for (const row of [...(actual.deltas ?? []), ...(actual.improving ?? [])]) {
  const e = byId.get(String(row.id));
  if (!e) { velocityMismatch.push(`${row.id}: drift lists it, the recount has no such comparable row`); continue; }
  if (Math.abs(Number(row.velocity) - e.velocity) > EPS)
    velocityMismatch.push(`${row.id}: velocity drift=${row.velocity} oracle=${e.velocity}`);
  if (Boolean(row.isModified) !== e.isModified)
    velocityMismatch.push(`${row.id}: isModified drift=${row.isModified} oracle=${e.isModified}`);
}

// The sentence must agree with the summary — the todo26 defect was two numbers, one word.
const messageMismatch = [];
const msg = String(actual.message ?? '');
if (oracleSummary.decay_count > 0 && !/decay/i.test(msg))
  messageMismatch.push(`summary says ${oracleSummary.decay_count} decaying, the message never says so: "${msg}"`);
if (oracleSummary.decay_count === 0 && /Structural decay in/.test(msg))
  messageMismatch.push(`message claims decay, the summary counts none: "${msg}"`);
// The todo26 defect was not a missing word, it was TWO NUMBERS under one: the sentence counted at
// 0.05 and `summary.decay_count` counted at > 0, printing 3 and 153 on the same screen. Checking only
// that the word "decay" appears would leave that exact bug green, so the numbers are read out of the
// sentence and compared to the summary they sit beside.
const said = msg.match(/Structural decay in (\d+) of (\d+) symbols compared/);
if (said) {
  if (Number(said[1]) !== oracleSummary.decay_count)
    messageMismatch.push(`message says ${said[1]} decaying, summary counts ${oracleSummary.decay_count}`);
  if (Number(said[2]) !== oracleSummary.total_symbols)
    messageMismatch.push(`message says ${said[2]} compared, summary counts ${oracleSummary.total_symbols}`);
}
const stable = msg.match(/stable across (\d+) symbols/);
if (stable && Number(stable[1]) !== oracleSummary.total_symbols)
  messageMismatch.push(`message says stable across ${stable[1]}, summary counts ${oracleSummary.total_symbols}`);
if (oracleSummary.identity_gap_count > 0 && !/no fingerprint/.test(msg))
  messageMismatch.push(`${oracleSummary.identity_gap_count} rows were never checked and the message does not say so: "${msg}"`);

const name = path.basename(projectDir);
console.log(`\n--- drift oracle: ${name} ---`);
console.log(`  prev → current    : ${PREV} → ${CUR}`);
console.log(`  status            : drift=${actual.status}  oracle=${oracleStatus}`);
for (const k of Object.keys(oracleSummary)) {
  console.log(`  ${k.padEnd(18)}: drift=${actual.summary?.[k]}  oracle=${oracleSummary[k]}`);
}
console.log(`  SUMMARY MISMATCH  : ${summaryMismatch.length}`);
console.log(`  STATUS MISMATCH   : ${statusMismatch.length}`);
console.log(`  MOVES INVENTED    : ${movesInvented.length}`);
console.log(`  MOVES MISSED      : ${movesMissed.length}`);
console.log(`  VELOCITY MISMATCH : ${velocityMismatch.length}  (over the ${(actual.deltas ?? []).length + (actual.improving ?? []).length} rows drift printed)`);
console.log(`  MESSAGE MISMATCH  : ${messageMismatch.length}`);

const show = (label, rows) => {
  if (!rows.length) return;
  console.log(`\n  ${label}`);
  for (const r of rows.slice(0, 12)) console.log(`    ${r}`);
  if (rows.length > 12) console.log(`    … and ${rows.length - 12} more`);
};
show('SUMMARY MISMATCH:', summaryMismatch);
show('STATUS MISMATCH:', statusMismatch);
show('MOVES INVENTED (drift reports a rename the pairing does not make):', movesInvented);
show('MOVES MISSED (the pairing finds a rename drift did not report):', movesMissed);
show('VELOCITY MISMATCH:', velocityMismatch);
show('MESSAGE MISMATCH (the sentence disagrees with the summary):', messageMismatch);

const clean = summaryMismatch.length === 0 && statusMismatch.length === 0 && movesInvented.length === 0
  && movesMissed.length === 0 && velocityMismatch.length === 0 && messageMismatch.length === 0;
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name}\n`);
process.exit(clean ? 0 : 1);
