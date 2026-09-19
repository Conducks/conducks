#!/usr/bin/env node
/**
 * Conducks — does `diff --base/--head` report the delta the vault actually holds? 🏺
 *
 * `diff` with `--base` is the CHRONOSCOPIC path: it compares two stored pulses. It is the command a
 * reader reaches for to answer "what did this change do to the architecture", and it is the command
 * that once answered that question from an EMPTY base graph — measured on conducks, two pulses three
 * minutes apart reported `+5472/-0 Symbols`, and a pulse id that did not exist produced the same
 * answer (ADR 0122). Nothing in the output told a real comparison from a fabricated one. That is the
 * class of defect this oracle exists to catch: an answer that is confidently, silently, entirely wrong.
 *
 * THE CLAIM, quoted from `src/interfaces/cli/commands/diff.ts`:
 *
 *   "`node_history` is the table that keeps per-pulse rows: pulseId, nodeId, gravity, complexity,
 *    fingerprint. Names and kinds are joined from `nodes` where the symbol still exists. There is NO
 *    edge history, so relationship counts are not reported rather than invented."
 *
 * and, in code, for two pulses base and head:
 *   added   = node ids in head's node_history rows, absent from base's
 *   removed = node ids in base's rows, absent from head's
 *   changed = ids in BOTH where gravityShift !== 0 || complexityBloat !== 0 || dnaShift
 *             where dnaShift = both fingerprints present AND different
 *
 * THE ORACLE re-derives that by a DIFFERENT MECHANISM. `diff` issues two `WHERE pulseId = ?` queries,
 * builds two JavaScript `Map`s, and diffs them with `Map.has` in a loop. This oracle asks DuckDB for
 * the whole comparison as ONE relational FULL OUTER JOIN and lets the database decide membership.
 * Same claim, two engines: a row that exists on one side only is `IS NULL` on the other, which is a
 * different question from `!map.has(id)` and fails differently when identity is mishandled.
 *
 * It scores FIVE directions:
 *   MISSED-ADDED / EXTRA-ADDED       the join says added, `diff` did not report it, and the reverse
 *   MISSED-REMOVED / EXTRA-REMOVED   the same for the removed side
 *   CHANGED COUNT                    `changedCount` against the join's count of changed rows
 *   CHANGED VALUES                   for every changed row `diff` actually printed, the three deltas
 *                                    it printed against the three the join computes
 *   NODE COUNTS                      baseNodeCount / headNodeCount against the raw per-pulse row
 *                                    counts — the single number that would have caught ADR 0122's
 *                                    empty base graph on the first run
 *
 * WHAT IT DOES NOT TEST, stated rather than discovered later:
 *   - THE GIT PATH. `conducks diff` with no `--base` is a completely different command: it maps git
 *     hunks to symbols and prints a composite risk score. That path has no second opinion here and
 *     is not scored by one line of this file.
 *   - EDGE DELTAS, because there are none to test. The vault keeps no edge history, so neither side
 *     can know whether a relationship appeared. `retains` says so in the output; that honesty is the
 *     whole feature and this oracle cannot verify what is not stored.
 *   - THE `changed` LIST BEYOND 50 ROWS. `diff` slices it at 50 and — unlike `drift`, which sets a
 *     `truncated` flag — says nothing about the cut. This oracle scores `changedCount` (untruncated)
 *     against the join, and the per-row values only for the rows it was shown. A disagreement hiding
 *     past row 50 is invisible to both of us.
 *   - WHETHER THE DELTA IS THE RIGHT DELTA. Both sides read `node_history`. If `analyze` wrote a
 *     wrong gravity, both agree on the wrong number. This scores the COMPARISON, not the analyzer.
 *   - `ConducksDiffEngine` (src/lib/core/graph/diff-engine.ts), which computes a richer delta —
 *     including edge counts and a `resonanceDrift` — over two IN-MEMORY graphs. The CLI's `--base`
 *     path does not call it. Scoring the class the command does not use would be theatre.
 *
 * CORPUS NOTE, and it is a finding rather than an aside: this oracle needs a vault holding at least
 * TWO pulses. Every subject vault under ../test-projects holds exactly ONE, so none of them can be
 * scored by this file at all. Point it at a repository that has been analyzed twice.
 *
 *   node tools/benchmark/oracle-diff.mjs <projectDir>
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
  console.error(`diff-oracle CANNOT RUN on ${projectDir}: the vault holds ${pulses.length} pulse(s).`);
  console.error(`  \`diff --base\` compares two pulses. One pulse is not a corpus for it — and this is`);
  console.error(`  the state every subject vault is in. Analyze the project twice, with a change between.`);
  process.exit(1);
}
const HEAD = String(pulses[0].id);
const BASE = String(pulses[1].id);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * ONE relational statement for the whole comparison — the different mechanism.
 *
 * Gravity is stored REAL (float32). It is widened to DOUBLE here so the subtraction happens in the
 * same precision `diff` does it in (JavaScript numbers), and a disagreement means a disagreement
 * rather than a float32-vs-float64 rounding artefact.
 */
const joined = await rowsOf(`
  SELECT
    COALESCE(h.nodeId, b.nodeId)                                     AS id,
    (b.nodeId IS NULL)                                               AS isAdded,
    (h.nodeId IS NULL)                                               AS isRemoved,
    CAST(COALESCE(h.gravity, 0) AS DOUBLE) - CAST(COALESCE(b.gravity, 0) AS DOUBLE) AS gravityShift,
    CAST(COALESCE(h.complexity, 0) AS DOUBLE) - CAST(COALESCE(b.complexity, 0) AS DOUBLE) AS complexityBloat,
    (b.fingerprint IS NOT NULL AND h.fingerprint IS NOT NULL AND b.fingerprint <> h.fingerprint) AS dnaShift
  FROM (SELECT * FROM node_history WHERE pulseId = ${q(HEAD)}) h
  FULL OUTER JOIN (SELECT * FROM node_history WHERE pulseId = ${q(BASE)}) b
    ON h.nodeId = b.nodeId
`);
const counts = await rowsOf(`
  SELECT
    (SELECT count(*) FROM node_history WHERE pulseId = ${q(BASE)}) AS base,
    (SELECT count(*) FROM node_history WHERE pulseId = ${q(HEAD)}) AS head
`);
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const oracleBaseCount = Number(counts[0].base);
const oracleHeadCount = Number(counts[0].head);

const oracleAdded = new Set();
const oracleRemoved = new Set();
const oracleChanged = new Map();
for (const r of joined) {
  const id = String(r.id);
  if (r.isAdded) { oracleAdded.add(id); continue; }
  if (r.isRemoved) { oracleRemoved.add(id); continue; }
  const g = Number(r.gravityShift), c = Number(r.complexityBloat), d = r.dnaShift === true;
  if (g !== 0 || c !== 0 || d) oracleChanged.set(id, { gravityShift: g, complexityBloat: c, dnaShift: d });
}

// A vault with two pulses and nothing in either is not a corpus (ADR 0044).
if (oracleBaseCount === 0 && oracleHeadCount === 0) {
  console.error(`diff-oracle FAILED: node_history holds no rows for either pulse in ${projectDir}. A check over zero is not a check.`);
  process.exit(1);
}

const raw = execFileSync('node', [CLI, 'diff', '--base', BASE, '--head', HEAD, '--json'], {
  cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
});
const actual = JSON.parse(raw.slice(raw.indexOf('{')));

const actualAdded = new Set((actual.nodes?.added ?? []).map(r => String(r.id)));
const actualRemoved = new Set((actual.nodes?.removed ?? []).map(r => String(r.id)));
const actualChanged = new Map((actual.changed ?? []).map(r => [String(r.id), r]));

const only = (a, b) => [...a].filter(x => !b.has(x));
const missedAdded = only(oracleAdded, actualAdded);
const extraAdded = only(actualAdded, oracleAdded);
const missedRemoved = only(oracleRemoved, actualRemoved);
const extraRemoved = only(actualRemoved, oracleRemoved);

const EPS = 1e-9;
const valueMismatch = [];
for (const [id, a] of actualChanged) {
  const e = oracleChanged.get(id);
  if (!e) { valueMismatch.push(`${id}: diff calls it changed, the join finds no delta at all`); continue; }
  if (Math.abs(Number(a.gravityShift) - e.gravityShift) > EPS)
    valueMismatch.push(`${id}: gravityShift diff=${a.gravityShift} join=${e.gravityShift}`);
  if (Number(a.complexityBloat) !== e.complexityBloat)
    valueMismatch.push(`${id}: complexityBloat diff=${a.complexityBloat} join=${e.complexityBloat}`);
  if (Boolean(a.dnaShift) !== e.dnaShift)
    valueMismatch.push(`${id}: dnaShift diff=${a.dnaShift} join=${e.dnaShift}`);
}

const countMismatch = [];
if (Number(actual.baseNodeCount) !== oracleBaseCount)
  countMismatch.push(`baseNodeCount diff=${actual.baseNodeCount} vault=${oracleBaseCount}`);
if (Number(actual.headNodeCount) !== oracleHeadCount)
  countMismatch.push(`headNodeCount diff=${actual.headNodeCount} vault=${oracleHeadCount}`);
if (Number(actual.nodes?.changedCount) !== oracleChanged.size)
  countMismatch.push(`changedCount diff=${actual.nodes?.changedCount} join=${oracleChanged.size}`);
if (String(actual.base) !== BASE) countMismatch.push(`base echoed as ${actual.base}, asked for ${BASE}`);
if (String(actual.head) !== HEAD) countMismatch.push(`head echoed as ${actual.head}, asked for ${HEAD}`);

const name = path.basename(projectDir);
console.log(`\n--- diff oracle: ${name} ---`);
console.log(`  base / head       : ${BASE} → ${HEAD}`);
console.log(`  vault rows        : ${oracleBaseCount} → ${oracleHeadCount}`);
console.log(`  join says added   : ${oracleAdded.size}    diff reported: ${actualAdded.size}`);
console.log(`  join says removed : ${oracleRemoved.size}    diff reported: ${actualRemoved.size}`);
console.log(`  join says changed : ${oracleChanged.size}    diff reported: ${actual.nodes?.changedCount}`);
console.log(`  MISSED-ADDED      : ${missedAdded.length}`);
console.log(`  EXTRA-ADDED       : ${extraAdded.length}`);
console.log(`  MISSED-REMOVED    : ${missedRemoved.length}`);
console.log(`  EXTRA-REMOVED     : ${extraRemoved.length}`);
console.log(`  VALUE MISMATCH    : ${valueMismatch.length}  (over the ${actualChanged.size} changed rows diff printed)`);
console.log(`  COUNT MISMATCH    : ${countMismatch.length}`);

const show = (label, rows) => {
  if (!rows.length) return;
  console.log(`\n  ${label}`);
  for (const r of rows.slice(0, 12)) console.log(`    ${r}`);
  if (rows.length > 12) console.log(`    … and ${rows.length - 12} more`);
};
show('MISSED-ADDED (join says added, diff did not report):', missedAdded);
show('EXTRA-ADDED (diff reported added, the join disagrees):', extraAdded);
show('MISSED-REMOVED (join says removed, diff did not report):', missedRemoved);
show('EXTRA-REMOVED (diff reported removed, the join disagrees):', extraRemoved);
show('VALUE MISMATCH (both agree it changed, and disagree how):', valueMismatch);
show('COUNT MISMATCH:', countMismatch);

// Agreement on an empty delta proves nothing about a diff (ADR 0044). Say so instead of printing a
// green that a caller would read as "diff works".
if (oracleAdded.size === 0 && oracleRemoved.size === 0 && oracleChanged.size === 0) {
  console.error(`\n  NOT A CHECK: these two pulses hold identical symbols with identical metrics, so both`);
  console.error(`  sides agree on nothing happening. Use a pulse pair with a real change between them.\n`);
  process.exit(1);
}

const clean = missedAdded.length === 0 && extraAdded.length === 0 && missedRemoved.length === 0
  && extraRemoved.length === 0 && valueMismatch.length === 0 && countMismatch.length === 0;
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name}\n`);
process.exit(clean ? 0 : 1);
