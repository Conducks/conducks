#!/usr/bin/env node
/**
 * Conducks — are the flows `flows` names the flows its own rule defines? 🌊
 *
 * `flows` answers "what does this system DO" — a handful of named processes instead of thousands of
 * functions. It is the command someone runs to orient, so a flow it silently drops is a capability
 * the reader never learns the system has.
 *
 * THE ORACLE re-derives the grouping from the stored graph by a different mechanism. `flows` walks
 * the in-memory adjacency list recursively; this reads the vault and does the same closure
 * iteratively over SQL rows. Same claim, different path — the reason `oracle-context.mjs` gives for
 * sharing the graph holds here too: grouping is a RULE over a graph, not the building of one.
 *
 * THE CLAIM, exactly as `flow-engine.ts::groupProcesses` states it:
 *   an ENTRY is a STRUCTURE / BEHAVIOR / ATOM node with a file and a name, whose name is not
 *   file-shaped, and which has either no incoming CALLS at all or only low-confidence ones
 *   (a cross-service HTTP call is not a local caller);
 *   its MEMBERS are the transitive closure over CALLS and ACCESSES, the entry included;
 *   and the CLI counts only THIS PROJECT's symbols against `--min-members`, because a flow of five
 *   built-ins passing a noise filter is the opposite of what the flag is for.
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - whether the grouping is USEFUL. "Is this the right way to carve a system into processes" is a
 *     design question; this scores conformance to the rule, not the rule.
 *   - the printed order, which is a rendering choice.
 *
 * IT ALSO REPORTS NAME COLLISIONS, which is not a disagreement but a property of the rule:
 * `groupProcesses` keys its result by the entry's BARE NAME, so two entries called `run` in
 * different files produce one key and the second silently overwrites the first.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positional ? path.resolve(positional) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** ADR-free but load-bearing: the id shape that names a file in THIS repository (contracts/project-symbol.ts). */
const SYNTHESISED = new Set(['global','external','typing','unresolved','lib','ecosystem','taxonomy','route','request','directory','repository','member']);
function isProjectSymbolId(id) {
  const raw = String(id ?? '');
  if (!raw || raw.includes('://')) return false;
  const sep = raw.lastIndexOf('::');
  if (sep < 0) return false;
  const filePart = raw.slice(0, sep);
  if (SYNTHESISED.has(filePart.toLowerCase())) return false;
  return /^([/\\]|[A-Za-z]:[/\\])/.test(filePart);
}

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
// `label` is `canonicalKind` on load (persistence.ts:580), so the column IS the field the rule reads.
const nodes = await (await conn.run(`SELECT id, name, canonicalKind, file FROM nodes`)).getRowObjects();
const edges = await (await conn.run(`SELECT sourceId, targetId, type, confidence, properties FROM edges WHERE type IN ('CALLS','ACCESSES')`)).getRowObjects();
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const down = new Map();
const incomingCalls = new Map();
for (const e of edges) {
  const s = String(e.sourceId), t = String(e.targetId);
  if (!down.has(s)) down.set(s, []);
  down.get(s).push(t);
  if (String(e.type) === 'CALLS') {
    if (!incomingCalls.has(t)) incomingCalls.set(t, []);
    // The `tier: 'service'` stamp the HTTP linker writes — NOT the confidence, which means
    // resolved-vs-guess and is never 1 on a CALLS edge (ADR 0191).
    let crossService = false;
    try { crossService = JSON.parse(String(e.properties ?? '{}'))?.tier === 'service'; } catch { /* no properties */ }
    incomingCalls.get(t).push(crossService);
  }
}

const isEntry = (n) => {
  if (!['STRUCTURE', 'BEHAVIOR', 'ATOM'].includes(String(n.canonicalKind))) return false;
  if (!n.file || !n.name) return false;
  if (/\.\w{2,5}$/.test(String(n.name))) return false;          // a file-level node, not a symbol
  const inc = incomingCalls.get(String(n.id)) ?? [];
  if (inc.length === 0) return true;
  return inc.every(Boolean);                                     // only cross-service HTTP callers
};

/**
 * The closure the engine walks, iteratively rather than recursively.
 *
 * A target is WALKED THROUGH whether or not a node exists for it, and COUNTED only if one does —
 * `collectDownstream` does `const node = graph.getNode(id); if (node) members.add(node.id)` and then
 * recurses regardless. The first version of this oracle counted every edge target, which inflated
 * every closure by its dangling ends and reported 8 flows the tool had correctly dropped below the
 * floor. The oracle was wrong, not the tool.
 */
const nodeIds = new Set(nodes.map(n => String(n.id)));
function closure(startId) {
  const visited = new Set([startId]);
  const members = new Set(nodeIds.has(startId) ? [startId] : []);
  const stack = [startId];
  while (stack.length) {
    for (const t of down.get(stack.pop()) ?? []) {
      if (visited.has(t)) continue;
      visited.add(t);
      if (nodeIds.has(t)) members.add(t);
      stack.push(t);
    }
  }
  return members;
}

const entries = nodes.filter(isEntry);

// Keyed by the entry's ID, as groupProcesses does since ADR 0191. Two entries may share a name.
const expected = new Map();
const nameCounts = new Map();
for (const e of entries) {
  nameCounts.set(String(e.name), (nameCounts.get(String(e.name)) ?? 0) + 1);
  expected.set(String(e.id), closure(String(e.id)));
}

const MIN = 2;
const kept = new Map();
for (const [name, members] of expected) {
  const own = [...members].filter(isProjectSymbolId);
  if (own.length >= MIN) kept.set(name, new Set(own));
}

const raw = execFileSync('node', [CLI, 'flows', '--json'], {
  cwd: projectDir, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
});
const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
const actual = new Map((parsed.flows ?? []).map(f => [String(f.id), new Set((f.symbols ?? []).filter(isProjectSymbolId))]));

const missed = [...kept.keys()].filter(n => !actual.has(n));
const extra  = [...actual.keys()].filter(n => !kept.has(n));
const memberDiff = [];
for (const [name, want] of kept) {
  const got = actual.get(name);
  if (!got) continue;
  const missing = [...want].filter(m => !got.has(m));
  const surplus = [...got].filter(m => !want.has(m));
  if (missing.length || surplus.length) memberDiff.push([name, missing.length, surplus.length]);
}

if (kept.size === 0 && actual.size === 0) {
  console.error(`flows-oracle FAILED: neither side produced a flow in ${projectDir}. A check over zero is not a check.`);
  process.exit(1);
}

const collided = [...nameCounts.values()].filter(c => c > 1);
const lostToCollision = collided.reduce((a, c) => a + (c - 1), 0);

const name = path.basename(projectDir);
console.log(`\n--- flows oracle: ${name} ---`);
console.log(`  entry points found : ${entries.length}`);
console.log(`  oracle flows (>=${MIN} own): ${kept.size}`);
console.log(`  flows reported     : ${actual.size}`);
console.log(`  MISSED             : ${missed.length}`);
console.log(`  EXTRA              : ${extra.length}`);
console.log(`  MEMBER MISMATCH    : ${memberDiff.length}`);
console.log(`  name collisions    : ${collided.length} name(s), ${lostToCollision} entry point(s) overwritten before either side saw them`);
const show = (label, rows, fmt) => {
  if (!rows.length) return;
  console.log(`\n  ${label}`);
  for (const r of rows.slice(0, 10)) console.log(`    ${fmt(r)}`);
  if (rows.length > 10) console.log(`    … and ${rows.length - 10} more`);
};
show('MISSED (rule says a flow, flows did not report it):', missed, n => n);
show('EXTRA (flows reported it, the rule does not make one):', extra, n => n);
show('MEMBER MISMATCH:', memberDiff, ([n, miss, sur]) => `${n}: ${miss} missing, ${sur} surplus`);

const clean = missed.length === 0 && extra.length === 0 && memberDiff.length === 0;
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name}\n`);
process.exit(clean ? 0 : 1);
