#!/usr/bin/env node
/**
 * Conducks — does `advise` name exactly the hubs its own exclusion ladder leaves standing? 💎
 *
 * `advise` is the command a reader runs when they do not yet know the codebase, so it is judged
 * entirely on whether its list is short and true. Its history is a list of times it was neither:
 * `repository::conducks` reported as a monolithic hub (ADR 0115), `ToolDefinition` and `Message` on
 * sofie, `OnConflict.APPEND` — an enum MEMBER — on the orchestrator, `global::str` and `global::os`
 * on the scraper. Every one of those was fan-in counted without asking what it was pointing at, and
 * every one was found by READING the output rather than the diff. This oracle is that reading, made
 * mechanical.
 *
 * THE TWO CLAIMS SCORED, quoted from source:
 *
 * 1. THE DENOMINATOR. `advise.ts:33` — "the DENOMINATOR, read before any advice is computed … the
 *    symbols it walked are what 'no sins detected' is a statement about". `--json` returns
 *    `{status, checked, found}`. `checked` must equal the number of symbols in the vault; an empty
 *    `found` with an unstated denominator is exactly the "examined nothing" / "examined thousands"
 *    collision ADR 0124 exists to close.
 *
 * 2. THE MONOLITHIC HUB SET. `advisor.ts:44` — `hubThreshold = max(stats.medianDegree * 5, 10)`,
 *    and a node is reported iff, after the ladder below, `crossFileCallerFiles.size > hubThreshold`:
 *      - not a CONTAINER (ECOSYSTEM/REPOSITORY/PACKAGE/NAMESPACE/DIRECTORY/UNIT) — containment is
 *        not coupling
 *      - `isProjectSymbolId` — you cannot split a built-in or a package namespace
 *      - SPLITTABLE (BEHAVIOR or STRUCTURE) — an ATOM has no halves
 *      - not a TYPE DECLARATION (interface/type/typealias/enum/union/alias) — a shared contract is
 *        shared on purpose
 *      - not a DATA CARRIER — a Python `@dataclass` or an `Enum` subclass is a type wearing a class
 *        keyword, decided from the DECLARED decorator or base, never from a shape guess
 *    counted over DISTINCT CALLER FILES, cross-file only.
 *
 * THE ORACLE re-derives both by a DIFFERENT mechanism. `advise` loads the vault into
 * `ConducksAdjacencyList`, walks `getAllNodes()` and calls `getNeighbors(id, 'upstream')` per node;
 * this reads the same vault and does the ladder as a SQL projection plus one grouped join, then
 * compares node-id sets. Sharing the graph is not circular for the same reason `oracle-context.mjs`
 * gives: detection is a RULE OVER a graph, not the building of one, and the rule is what is on
 * trial. The ladder is the part that has been wrong five times; the graph is not.
 *
 * WHAT IT DOES NOT TEST, stated rather than discovered later:
 *   - the other SEVEN advice rules. CIRCULAR is `oracle-audit.mjs`'s subject (cycle truth), and
 *     INTUITION, HIDDEN_COUPLING, the composite RISK score, unpinned dependencies and SplitScore are
 *     all WEIGHTED POLICIES — `(gravity*0.4)+(entropy*0.3)+(churn*0.2)-(cohesion*0.5)+0.5` is a
 *     number nobody can second-guess without inventing a second policy, which compares two opinions
 *     rather than finding a defect. `bench-advise.mjs` scores their SHAPE instead.
 *   - whether the hub threshold is the RIGHT threshold. This scores conformance to the ladder, not
 *     the ladder.
 *   - the human ordering, colouring, and the `… and N more` truncation of the text renderer. Only
 *     `--json` is read.
 *   - anything about a project whose vault is stale. The oracle and the command read the same file,
 *     so they agree about a stale graph just as confidently as about a fresh one.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positional ? path.resolve(positional) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** advisor.ts:46 — containment is not coupling. */
const CONTAINERS = new Set(['ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT']);
/** advisor.ts:70 — only a function or a class has halves to split. */
const SPLITTABLE = new Set(['BEHAVIOR', 'STRUCTURE']);
/** advisor.ts:77 — an interface is kinded STRUCTURE and is still not splittable. */
const TYPE_DECLARATIONS = new Set(['interface', 'type', 'typealias', 'enum', 'union', 'alias']);
/** advisor.ts:90/91 — a type wearing a class keyword, read from DECLARED evidence only. */
const DATA_DECORATORS = new Set(['dataclass', 'attrs', 'attr.s', 'define', 'frozen', 'model']);
const DATA_BASES = new Set([
  'enum', 'intenum', 'strenum', 'flag', 'intflag', 'namedtuple', 'typeddict', 'protocol',
  'basemodel', 'dataclass', 'tuple',
]);
/** contracts/project-symbol.ts, verbatim. */
const SYNTHESISED_NAMESPACES = new Set([
  'global', 'external', 'typing', 'unresolved', 'lib', 'ecosystem', 'taxonomy', 'route', 'request',
  'directory', 'repository', 'member',
]);
function isProjectSymbolId(id) {
  const raw = String(id ?? '');
  if (!raw || raw.includes('://')) return false;
  const sep = raw.lastIndexOf('::');
  if (sep < 0) return false;
  const filePart = raw.slice(0, sep);
  if (SYNTHESISED_NAMESPACES.has(filePart.toLowerCase())) return false;
  return /^([/\\]|[A-Za-z]:[/\\])/.test(filePart);
}
/** contracts/decorators.ts, verbatim. */
const decoratorCallee = (raw) => {
  const text = String(raw).trim().replace(/^@/, '');
  const paren = text.indexOf('(');
  return ((paren > -1 ? text.slice(0, paren) : text).trim().split(/\s/)[0]) ?? '';
};

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const q = async (sql) => (await (await conn.run(sql)).getRowObjects());

const nodeCount = Number((await q(`SELECT count(*) AS c FROM nodes`))[0].c);
const nodes = await q(`
  SELECT id, canonicalKind, semantic_kind, file,
         json_extract(metadata, '$.dna.decorators') AS decorators
  FROM nodes`);
/** `stats.medianDegree` is the median over `outEdges.values()` — sources only, not every node. */
const outDegrees = (await q(`SELECT count(*) AS d FROM edges GROUP BY sourceId`)).map(r => Number(r.d));
/** Distinct CALLER FILES per node, cross-file only — advisor.ts reads every upstream edge type. */
const callerFiles = await q(`
  SELECT e.targetId AS id, count(DISTINCT s.file) AS n
  FROM edges e
  JOIN nodes s ON s.id = e.sourceId
  JOIN nodes t ON t.id = e.targetId
  WHERE s.file IS NOT NULL AND s.file IS DISTINCT FROM t.file
  GROUP BY 1`);
/** A heritage base an advisor would read as "this is a record type, not behaviour". */
const heritage = await q(`
  SELECT sourceId AS id, targetId FROM edges WHERE type IN ('EXTENDS', 'IMPLEMENTS')`);
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

outDegrees.sort((a, b) => a - b);
const medianDegree = outDegrees.length > 0 ? outDegrees[Math.floor(outDegrees.length / 2)] : 0;
const hubThreshold = Math.max(medianDegree * 5, 10);

const basesOf = new Map();
for (const h of heritage) {
  const target = String(h.targetId);
  const sep = target.lastIndexOf('::');
  const base = ((sep >= 0 ? target.slice(sep + 2) : target).split('.').pop() ?? '').toLowerCase();
  const key = String(h.id);
  if (!basesOf.has(key)) basesOf.set(key, []);
  basesOf.get(key).push(base);
}
const callersOf = new Map(callerFiles.map(r => [String(r.id), Number(r.n)]));

const isDataCarrier = (n) => {
  let decorators = n.decorators;
  if (typeof decorators === 'string') { try { decorators = JSON.parse(decorators); } catch { decorators = []; } }
  for (const raw of (Array.isArray(decorators) ? decorators : [])) {
    if (DATA_DECORATORS.has(decoratorCallee(String(raw)).split('.').pop()?.toLowerCase() ?? '')) return true;
  }
  for (const base of (basesOf.get(String(n.id)) ?? [])) if (DATA_BASES.has(base)) return true;
  return false;
};

/** The ladder, in advisor.ts's order. */
const expected = new Set();
for (const n of nodes) {
  const kind = String(n.canonicalKind ?? '');
  if (CONTAINERS.has(kind)) continue;
  if (!isProjectSymbolId(String(n.id))) continue;
  if (!SPLITTABLE.has(kind)) continue;
  if (TYPE_DECLARATIONS.has(String(n.semantic_kind ?? '').toLowerCase())) continue;
  if (isDataCarrier(n)) continue;
  if ((callersOf.get(String(n.id)) ?? 0) > hubThreshold) expected.add(String(n.id));
}

const raw = execFileSync('node', [CLI, 'advise', '--json'], {
  cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
});
const report = JSON.parse(raw.slice(raw.indexOf('{')));
/** Only the per-node "Monolithic Hub" finding. The High-Risk HUB finding carries rendered TEXT in
 *  `nodes`, not ids, and is a weighted policy this oracle deliberately does not score. */
const actual = new Set(
  (report.found ?? [])
    .filter(a => a.type === 'HUB' && String(a.message).startsWith('Monolithic Hub'))
    .flatMap(a => a.nodes.map(String))
);

const missed = [...expected].filter(id => !actual.has(id));
const extra = [...actual].filter(id => !expected.has(id));
const denominatorAgrees = Number(report.checked) === nodeCount;

const name = path.basename(projectDir);
console.log(`\n--- advise oracle: ${name} ---`);
console.log(`  symbols in vault      : ${nodeCount}`);
console.log(`  advise says checked   : ${report.checked}   ${denominatorAgrees ? '(agrees)' : '(DISAGREES)'}`);
console.log(`  median out-degree     : ${medianDegree}  →  hub threshold ${hubThreshold} caller file(s)`);
console.log(`  ladder says hub       : ${expected.size}`);
console.log(`  advise reported hub   : ${actual.size}`);
console.log(`  MISSED                : ${missed.length}`);
console.log(`  EXTRA                 : ${extra.length}`);
const show = (label, ids) => {
  if (!ids.length) return;
  console.log(`\n  ${label}`);
  for (const id of ids.slice(0, 12)) console.log(`    ${callersOf.get(id) ?? 0} caller file(s)  ${id}`);
  if (ids.length > 12) console.log(`    … and ${ids.length - 12} more`);
};
show('MISSED (ladder says hub, advise did not report):', missed);
show('EXTRA (advise reported, the ladder excludes it):', extra);

/**
 * A check over zero is not a check (ADR 0044). `advise` has its own version of this — it refuses to
 * call an empty vault pristine — and the oracle owes the same refusal: if the vault holds nothing,
 * both sides agree about nothing and the agreement means nothing.
 */
if (nodeCount === 0) {
  console.error(`\n  ✖ NOT ASSESSED on ${name}: the vault holds no symbols. Run \`conducks analyze\` first.\n`);
  process.exit(1);
}
if (expected.size === 0 && actual.size === 0) {
  console.log(`\n  NOTE: neither side named a hub. The DENOMINATOR is still scored (${nodeCount} symbols),`);
  console.log(`        but the ladder itself was not exercised on this project — see bench-advise.mjs.`);
}

const clean = missed.length === 0 && extra.length === 0 && denominatorAgrees;
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name}\n`);
process.exit(clean ? 0 : 1);
