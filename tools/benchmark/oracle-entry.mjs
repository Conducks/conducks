#!/usr/bin/env node
/**
 * Conducks — are the entry points `entry` reports the entry points its own rules define? 🚪
 *
 * `entry` answers "where does this program start", the first question anyone asks of an unfamiliar
 * codebase. It is the command a reader trusts BEFORE they know enough to notice it is wrong, which
 * is what makes a silent miss expensive here: the answer looks complete either way.
 *
 * THE ORACLE re-derives the answer from the stored graph by a different mechanism. `entry` walks the
 * in-memory adjacency list node by node; this reads the vault and does the same three rules as set
 * operations over SQL rows. Same claim, different path — the reason `oracle-context.mjs` gives for
 * sharing the graph applies unchanged: detection is a RULE over a graph, not the building of one, so
 * the rule is what is under test and sharing the graph is not circular.
 *
 * THE CLAIM, exactly as ADR 0113 states it — three rules, each restricted to a kind that can really
 * be an entry, each recording WHY:
 *   route          a framework route or handler on a BEHAVIOR/INFRA node — served, not called
 *   entry-filename a UNIT whose basename is a conventional program entry
 *   root-module    a UNIT nothing imports, which imports something itself
 * with tests and scratch trees excluded, and a TEST importer NOT disqualifying a root module.
 *
 * It scores THREE directions, because two would let a whole class through:
 *   MISSED    the rules say entry, `entry` did not report it
 *   EXTRA     `entry` reported it, the rules do not make it one
 *   REASON    both agree it is an entry and disagree about WHY — ADR 0113 made `reason` an audited,
 *             printed field, so a right answer for the wrong stated reason is a real defect
 *
 * WHAT IT DOES NOT TEST, stated rather than discovered later:
 *   - the GRAVITY ranking. Which entry point matters most is a policy, and scoring a policy against
 *     a second opinion only compares two policies (same call as `oracle-context.mjs`).
 *   - whether the rules are the RIGHT rules. This scores conformance to ADR 0113, not the ADR.
 *   - routes on frameworks the parser never detected: if `is_route` was never set, both sides agree
 *     it is not a route and the pair is silent. That is a recall gap in the PARSER, and L2 is where
 *     a planted route has to surface it.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positional ? path.resolve(positional) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** ADR 0113's set, verbatim. `index.ts` is deliberately absent: a barrel is never where execution starts. */
const ENTRY_FILES = new Set([
  'main.py', 'app.py', '__main__.py',
  'main.go', 'main.rs', 'main.java', 'main.c', 'main.cpp',
  'server.ts', 'server.js', 'cli.ts', 'cli.js', 'app.ts', 'app.js',
]);
const isTest = (f) => /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[jt]sx?$/.test(f);
const isScratch = (f) => /(^|\/)(scripts?|tools?|examples?|fixtures?)\//.test(f);

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const nodes = await (await conn.run(
  `SELECT id, name, canonicalKind, file, is_route FROM nodes`)).getRowObjects();
const imports = await (await conn.run(
  `SELECT sourceId, targetId FROM edges WHERE type = 'IMPORTS'`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const byId = new Map(nodes.map(n => [String(n.id), n]));
const fileOf = (id) => String(byId.get(id)?.file ?? '');

/** Importers that are not tests — the distinction ADR 0113 turns on. */
const nonTestImporters = new Map();
const outgoing = new Map();
for (const e of imports) {
  const s = String(e.sourceId), t = String(e.targetId);
  outgoing.set(s, (outgoing.get(s) ?? 0) + 1);
  if (!isTest(fileOf(s))) nonTestImporters.set(t, (nonTestImporters.get(t) ?? 0) + 1);
}

/** The oracle's verdict for one node: a reason, or null. */
function classify(n) {
  const kind = String(n.canonicalKind ?? '');
  const file = String(n.file ?? '');
  const base = file ? (file.split('/').pop() ?? '') : '';
  if (n.is_route === true && (kind === 'BEHAVIOR' || kind === 'INFRA') && !isTest(file)) return 'route';
  if (kind === 'UNIT' && ENTRY_FILES.has(base.toLowerCase()) && !isTest(file) && !isScratch(file)) return 'entry-filename';
  if (kind === 'UNIT' && !isTest(file) && !isScratch(file)) {
    const inn = nonTestImporters.get(String(n.id)) ?? 0;
    const out = outgoing.get(String(n.id)) ?? 0;
    if (inn === 0 && out > 0) return 'root-module';
  }
  return null;
}

const expected = new Map();
for (const n of nodes) { const r = classify(n); if (r) expected.set(String(n.id), r); }

const raw = execFileSync('node', [CLI, 'entry', projectDir, '--json'], {
  encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
});
const actual = new Map(JSON.parse(raw.slice(raw.indexOf('['))).map(r => [String(r.id), String(r.reason ?? '')]));

const missed = [...expected].filter(([id]) => !actual.has(id));
const extra  = [...actual].filter(([id]) => !expected.has(id));
const reason = [...expected].filter(([id, r]) => actual.has(id) && actual.get(id) !== r)
  .map(([id, r]) => [id, r, actual.get(id)]);

// A run that scored nothing is not a pass (ADR 0044).
if (expected.size === 0 && actual.size === 0) {
  console.error(`entry-oracle FAILED: neither side produced an entry point in ${projectDir}. A check over zero is not a check.`);
  process.exit(1);
}

const name = path.basename(projectDir);
console.log(`\n--- entry oracle: ${name} ---`);
console.log(`  oracle says entry : ${expected.size}`);
console.log(`  entry reported    : ${actual.size}`);
console.log(`  MISSED            : ${missed.length}`);
console.log(`  EXTRA             : ${extra.length}`);
console.log(`  REASON MISMATCH   : ${reason.length}`);
const show = (label, rows, fmt) => {
  if (!rows.length) return;
  console.log(`\n  ${label}`);
  for (const r of rows.slice(0, 12)) console.log(`    ${fmt(r)}`);
  if (rows.length > 12) console.log(`    … and ${rows.length - 12} more`);
};
show('MISSED (oracle says entry, entry did not report):', missed, ([id, r]) => `[${r}] ${id}`);
show('EXTRA (entry reported, rules do not make it one):', extra, ([id, r]) => `[${r}] ${id}`);
show('REASON MISMATCH (both agree it is an entry):', reason, ([id, e, a]) => `oracle=${e} entry=${a}  ${id}`);

const clean = missed.length === 0 && extra.length === 0 && reason.length === 0;
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name}\n`);
process.exit(clean ? 0 : 1);
