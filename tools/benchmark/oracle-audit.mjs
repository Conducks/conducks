#!/usr/bin/env node
/**
 * Conducks — are the cycles `audit` reports the cycles that are there? 🔁
 *
 * `audit` is the gate. It is the command a CI job fails a build on, so a cycle it does not see is a
 * rule nobody is enforcing, and a cycle it invents is a build blocked on nothing. Both are silent.
 *
 * THE ORACLE uses a DIFFERENT COMPUTATION, not merely different code. `cycle-detector.ts` runs
 * Tarjan — `strongconnect` — over the in-memory graph; this asks, for every node in the filtered
 * subgraph, whether the node can reach ITSELF, and groups two nodes together when each reaches the
 * other. Mutual reachability and strongly-connected components are the same set by definition and
 * arrive by different roads, which is the point: a bug in one is not a bug in the other.
 *
 * THE CLAIM, exactly as the code states it:
 *   ARCH-3 traverses MODULE coupling only — IMPORTS, EXTENDS, IMPLEMENTS, DEPENDS_ON, FROM_IMAGE,
 *   VIRTUAL_LINK — because containment is not dependency (ADR 0010) and a type-only import is erased
 *   by the compiler (ADR 0016), so an `isTypeOnly` edge is dropped as well.
 *   ARCH-6 traverses CALLS only, and is a DISCOVERY that never fails an audit: mutual recursion is
 *   legal, and only a human can tell it from a knot (ADR 0017).
 *
 * WHAT IT DOES NOT TEST, stated rather than found out later:
 *   - the sentinel rules (ARCH-1). They are project-declared data in `config/sentinel.json`, so
 *     scoring them here would score a fixture's own configuration.
 *   - the printed ROUTE through a cluster, or which edge is named as the cut. Those are a rendering
 *     and a heuristic; the membership is the claim.
 *   - `stats.orphans` and `ecosystem_dangling`, which `prune` owns and Phase 1 already scored.
 *
 * THE CAP IS PART OF THE CLAIM. The detector keeps at most 20 clusters and walks at most 20,000
 * steps, so a disagreement above the cap is the cap doing its job. It is reported separately rather
 * than counted as a miss.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positional ? path.resolve(positional) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** `atOrBelow('module')` — the only coupling ARCH-3 follows. */
const MODULE_EDGES = new Set(['IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'DEPENDS_ON', 'FROM_IMAGE', 'VIRTUAL_LINK']);
const MAX_CYCLES_KEPT = 20;

const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
const conn = await db.connect();
const rows = await (await conn.run(`SELECT sourceId, targetId, type, properties FROM edges`)).getRowObjects();
// ARCH-3 requires a cycle to span two FILES, so the oracle needs each node's file.
const fileRows = await (await conn.run(`SELECT id, file FROM nodes`)).getRowObjects();
const fileOf = new Map(fileRows.map(r => [String(r.id), String(r.file ?? r.id)]));
try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }

const typeOnly = (p) => { try { return JSON.parse(String(p ?? '{}'))?.isTypeOnly === true; } catch { return false; } };

const subgraph = (keep) => {
  const adj = new Map();
  for (const r of rows) {
    if (!keep(r)) continue;
    const s = String(r.sourceId), t = String(r.targetId);
    if (!adj.has(s)) adj.set(s, new Set());
    adj.get(s).add(t);
  }
  return adj;
};

/** Everything reachable from `start` by one or more edges. */
function reach(adj, start) {
  const seen = new Set();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    for (const t of adj.get(n) ?? []) if (!seen.has(t)) stack.push(t);
  }
  return seen;
}

/**
 * Clusters by MUTUAL REACHABILITY: a node is on a cycle when it reaches itself, and two such nodes
 * belong together when each reaches the other. No SCC algorithm anywhere in this file.
 */
function clusters(adj) {
  const onCycle = [];
  const reachOf = new Map();
  for (const v of adj.keys()) {
    const r = reach(adj, v);
    reachOf.set(v, r);
    if (r.has(v)) onCycle.push(v);
  }
  const seen = new Set();
  const out = [];
  for (const v of onCycle) {
    if (seen.has(v)) continue;
    const group = onCycle.filter(w => !seen.has(w) && (w === v || (reachOf.get(v)?.has(w) && reachOf.get(w)?.has(v))));
    group.forEach(w => seen.add(w));
    out.push(group);
  }
  return out;
}

/**
 * Both rules drop a cluster of ONE — self-recursion is a normal shape, not a tangle, and a symbol
 * owning its own members is not a module cycle.
 *
 * ARCH-3 additionally requires the cluster to span TWO FILES: "a genuine architectural cycle spans
 * ≥2 files; a single-file loop is an implementation detail, not a module-dependency smell". ARCH-6
 * deliberately does NOT, because mutual calls inside one file are exactly what ARCH-3 refuses to
 * look at. The first version of this oracle modelled neither filter and agreed on all three subjects
 * anyway — the numbers were right for the wrong reason, which is the shape of a check that would
 * have passed a real defect.
 */
const multi = (cs) => cs.filter(c => c.length > 1);
const spansFiles = (c) => new Set(c.map(id => fileOf.get(id) ?? id)).size > 1;

const arch3 = multi(clusters(subgraph(r => MODULE_EDGES.has(String(r.type)) && !typeOnly(r.properties)))).filter(spansFiles);
const arch6 = multi(clusters(subgraph(r => String(r.type) === 'CALLS')));

// `audit` is a GATE: it exits 1 when it finds a violation, which is the whole point of it. The
// first version of this oracle used a plain execFileSync and read that exit as a crash, so it threw
// on the only two subjects that actually have something to report — scoring nothing on precisely the
// runs that mattered, and passing on the clean one.
let raw;
try {
  raw = execFileSync('node', [CLI, 'audit', '--json'], { cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
} catch (err) {
  if (err.stdout === undefined) throw err;      // a real failure to run, not a failing audit
  raw = String(err.stdout);
}
const got = JSON.parse(raw.slice(raw.indexOf('{')));
const reportedCycles = Number(got.stats?.cycles ?? 0);
const reportedTangles = (got.discoveries ?? []).filter(d => String(d.type) === 'TANGLE').length;

const capped = (n) => n > MAX_CYCLES_KEPT;
const cmp = (label, mine, theirs) => {
  if (capped(mine) || capped(theirs)) {
    const ok = theirs === Math.min(mine, MAX_CYCLES_KEPT);
    return { label, mine, theirs, ok, note: `cap ${MAX_CYCLES_KEPT} reached` };
  }
  return { label, mine, theirs, ok: mine === theirs, note: '' };
};

const results = [cmp('ARCH-3 module cycles', arch3.length, reportedCycles),
                 cmp('ARCH-6 call tangles', arch6.length, reportedTangles)];

if (arch3.length === 0 && arch6.length === 0 && reportedCycles === 0 && reportedTangles === 0) {
  console.error(`audit-oracle FAILED: neither side found a cycle OR a tangle in ${projectDir}. A check over zero is not a check.`);
  process.exit(1);
}

const name = path.basename(projectDir);
console.log(`\n--- audit oracle: ${name} ---`);
for (const r of results) {
  console.log(`  ${r.label.padEnd(22)} oracle ${String(r.mine).padStart(4)}   audit ${String(r.theirs).padStart(4)}   ${r.ok ? 'agree' : 'DISAGREE'}${r.note ? '  (' + r.note + ')' : ''}`);
}
const clean = results.every(r => r.ok);
console.log(`\n  ${clean ? 'EXACT' : 'DISAGREEMENT'} on ${name}\n`);
process.exit(clean ? 0 : 1);
