#!/usr/bin/env node
/**
 * Conducks — does `guard` block on exactly the illegal layer dependencies its own contract names? 🛡️
 *
 * `guard` is the only command wired to a commit hook. Everything else it prints is advice; the layer
 * contract is the one thing it EXITS 1 on, so that is the claim worth scoring. A gate that says
 * "✅ Layer contract clean." while it checked nothing is the failure mode this repository has hit
 * before (todo06: the rule shipped as data only and `guard` filtered for a ruleId that was never
 * loaded), and it looks identical from the outside to a gate that checked everything.
 *
 * THE CLAIM, quoted from `src/lib/domain/governance/index.ts:349-351`:
 *   "Clean-Architecture guard (ADR 0005): an import edge from layer A to layer B is legal
 *    only if B ∈ ALLOWED_DEPENDENCIES[A]. Same-layer edges are always legal."
 * with, from the same block:
 *   - only IMPORTS / EXTENDS / IMPLEMENTS / DEPENDS_ON edges count (ADR 0120 — a CALLS edge routed
 *     through the registry is what composition exists to make legal)
 *   - test files classify to NO layer, so they are exempt
 *   - one violation per illegal layer-PAIR, not per edge
 * and from `src/interfaces/cli/commands/guard.ts:32`:
 *   `ruleReport.violations.filter(v => v.ruleId === 'layer_boundaries')` — only these block.
 *
 * THE ORACLE re-derives that set by a DIFFERENT mechanism. `guard` walks the in-memory adjacency
 * list edge by edge through `ConducksAdjacencyList.getAllEdges()`; this reads the vault and does the
 * same mapping as a SQL join plus set arithmetic, then compares against the pairs `guard` PRINTS.
 * `guard` has no `--json` (measured: `conducks guard [--threshold=N] [--force]`), so the observable
 * surface is its text and its exit code, and both are scored.
 *
 * IT SCORES THE DENOMINATOR FIRST, and this is the point of the oracle rather than a footnote.
 * `LAYER_FRAGMENTS` is HARDCODED to conducks' own tree — `/lib/core`, `/lib/domain`, `/registry`,
 * `/interfaces/cli`, `/interfaces/tools`, `/interfaces/web`, `/contracts`. On a project that is not
 * conducks, `layerOf` returns null for every file, no edge is ever examined, and `guard` prints
 * "✅ Layer contract clean." A tick over zero subjects is not a pass (ADR 0044), so this oracle
 * reports NOT ASSESSED and exits non-zero rather than agreeing with it — the disagreement IS the
 * finding.
 *
 * It scores three directions:
 *   SUBJECTS  how many dependency edges had BOTH ends inside a layer. Zero → NOT ASSESSED.
 *   MISSED    the contract says illegal, `guard` did not print it
 *   EXTRA     `guard` printed it, the contract does not make it illegal
 * plus EXIT: `guard` must exit non-zero iff it printed at least one layer violation.
 *
 * WHAT IT DOES NOT TEST, stated rather than discovered later:
 *   - the STRUCTURAL REGRESSION half (`registry.audit.guard(threshold)` → `RegressionGuard.
 *     shouldBlock`). That compares two PULSES over time, not a graph, so a graph oracle has nothing
 *     to re-derive it from. `bench-guard.mjs` covers its stated semantics — NOT ASSESSED must not
 *     read as a pass, and it must not block — by driving real pulses instead.
 *   - the OTHER sentinel rules (`no_cycles`, `rank_violations`). `guard` prints them and does not
 *     block on them, so they change no outcome; `oracle-audit.mjs` owns cycle truth.
 *   - whether ALLOWED_DEPENDENCIES is the RIGHT contract. This scores conformance to ADR 0005, not
 *     the ADR.
 *   - `--force`, which runs a full `analyze` pulse. Never run against a shared subject.
 *   - a project-local `.conducks/sentinel.yml`, which replaces the default rule set entirely. See
 *     `bench-guard.mjs` scenario 05 for what that does to the gate.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positional ? path.resolve(positional) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** `sentinel-rules.ts` LAYER_FRAGMENTS, verbatim. ORDER MATTERS — `/lib/core` before `/registry`. */
const LAYER_FRAGMENTS = [
  ['contracts', '/contracts'],
  ['core', '/lib/core'],
  ['domain', '/lib/domain'],
  ['composition', '/registry'],
  ['cli', '/interfaces/cli'],
  ['mcp', '/interfaces/tools'],
  ['web', '/interfaces/web'],
];
/** `sentinel-rules.ts` ALLOWED_DEPENDENCIES, verbatim. */
const ALLOWED = {
  contracts: [],
  core: ['contracts'],
  domain: ['core', 'contracts'],
  composition: ['domain', 'core', 'contracts'],
  cli: ['composition', 'contracts', 'web', 'mcp'],
  mcp: ['composition', 'contracts'],
  web: ['composition', 'domain', 'core', 'contracts'],
};
/** The set `guard` blocks on. TYPE_REFERENCE is deliberately absent — `import type` erases. */
const DEPENDENCY_EDGES = new Set(['IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'DEPENDS_ON']);

/** `layerOf` from governance/index.ts:352, including the test exemption that precedes the fragments. */
function layerOf(file) {
  if (!file) return null;
  const f = String(file).toLowerCase();
  if (/(^|\/)tests?\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f)) return null;
  for (const [name, frag] of LAYER_FRAGMENTS) if (f.includes(frag)) return name;
  return null;
}

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const rows = await (await conn.run(`
  SELECT s.file AS sfile, t.file AS tfile
  FROM edges e
  JOIN nodes s ON s.id = e.sourceId
  JOIN nodes t ON t.id = e.targetId
  WHERE e.type IN (${[...DEPENDENCY_EDGES].map(t => `'${t}'`).join(', ')})
`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

/** The contract's verdict: which layer PAIRS are illegal, and how many edges it could even look at. */
let inLayer = 0;
const expected = new Set();
for (const r of rows) {
  const s = layerOf(r.sfile), t = layerOf(r.tfile);
  if (!s || !t) continue;
  inLayer++;
  if (s === t) continue;
  if (!(ALLOWED[s] ?? []).includes(t)) expected.add(`${s}->${t}`);
}

/** `guard` has no --json. Its violation lines are the surface; exit 1 is the other half of it. */
let stdout = '', status = 0;
try {
  stdout = execFileSync('node', [CLI, 'guard'], {
    cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  status = err.status ?? 1;
  stdout = String(err.stdout ?? '') + String(err.stderr ?? '');
}
const actual = new Set(
  [...stdout.matchAll(/Illegal layer dependency: (\w+) → (\w+)/g)].map(m => `${m[1]}->${m[2]}`)
);
const saidClean = stdout.includes('Layer contract clean');

const missed = [...expected].filter(p => !actual.has(p));
const extra = [...actual].filter(p => !expected.has(p));

const name = path.basename(projectDir);
console.log(`\n--- guard oracle: ${name} ---`);
console.log(`  dependency edges in vault : ${rows.length}`);
console.log(`  edges with BOTH ends in a layer (the denominator) : ${inLayer}`);
console.log(`  contract says illegal     : ${expected.size}`);
console.log(`  guard printed as illegal  : ${actual.size}`);
console.log(`  MISSED                    : ${missed.length}`);
console.log(`  EXTRA                     : ${extra.length}`);
console.log(`  guard exit status         : ${status}`);
if (missed.length) console.log(`\n  MISSED (contract says illegal, guard did not print):\n    ${missed.join('\n    ')}`);
if (extra.length) console.log(`\n  EXTRA (guard printed, contract does not make it illegal):\n    ${extra.join('\n    ')}`);

/**
 * A gate over zero subjects is not a gate. `LAYER_FRAGMENTS` is conducks' own tree, so on any other
 * project `layerOf` is null everywhere and the "✅ Layer contract clean." tick is a statement about
 * nothing. ADR 0044: refuse it out loud.
 */
if (inLayer === 0) {
  console.error(
    `\n  ✖ NOT ASSESSED on ${name}: not one dependency edge had both ends inside a layer, so the\n` +
    `    layer contract examined nothing` + (saidClean ? ` — and guard still printed "✅ Layer contract clean."` : '.') +
    `\n    LAYER_FRAGMENTS is hardcoded to conducks' own tree (sentinel-rules.ts:53). On any other\n` +
    `    project this gate is a permanent no-op that reads as a pass.\n`
  );
  process.exit(1);
}

const exitAgrees = (actual.size > 0) === (status !== 0);
if (!exitAgrees) {
  console.error(`\n  ✖ EXIT DISAGREES: guard printed ${actual.size} layer violation(s) and exited ${status}.`);
}

const clean = missed.length === 0 && extra.length === 0 && exitAgrees;
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name} (${inLayer} edges examined)\n`);
process.exit(clean ? 0 : 1);
