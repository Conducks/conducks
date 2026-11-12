#!/usr/bin/env node
/**
 * Conducks — score Java call edges (what `impact` and `trace` walk) against javac. 🏺
 *
 * WHY THIS EXISTS. `impact X` answers "who calls X" from CALLS / CONSTRUCTS edges, and in Java those
 * edges are bound by NAME — conducks has no types. The dead-code oracle only sees whether a symbol has
 * ANY incoming edge; a call bound to the wrong same-named method passes it. This scores every edge.
 *
 * THE ORACLE. `oracle-java/JavaCalls.java` (JDK only, offline): every call javac resolves from one
 * project declaration to another — invocation, `new`, method reference — with both ends spelled the
 * way conducks spells node ids (`file::outer.inner.method`).
 *
 * SCORED PER (caller, callee) PAIR, both directions:
 *   RECALL     each javac pair: conducks has the edge (EXACT), has a call of that name from the caller
 *              bound to ANOTHER project node (WRONG), left it unbound (UNBOUND), or has nothing (MISSING).
 *              `new X(…)` matches the class or its constructor — conducks' CONSTRUCTS names the class.
 *   PRECISION  each conducks CALLS/CONSTRUCTS edge between project nodes: javac resolved a call of that
 *              name from the same caller to the same callee (RIGHT), to a different one (WRONG), or
 *              resolved none of that name there (UNVERIFIABLE — a library receiver javac could not type
 *              without a classpath, or a name javac does not see as a call).
 *
 * RATCHET (oracle-baseline.json): EXACT may not fall, either WRONG may not rise.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetVault } from './reset-vault.mjs';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(HERE, '../../build/src');
const CLI = path.join(BUILD, 'interfaces/cli/index.js');
const HELPER = path.join(HERE, 'oracle-java', 'JavaCalls.java');

let o;
try {
  o = JSON.parse(execFileSync('java', [HELPER, projectDir], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
} catch (e) {
  console.error(`\n✖ the Java helper failed (is a JDK on PATH?):\n${e.stderr || e.message}`);
  process.exit(2);
}
if (!o.edges.length) { console.error('\n✖ javac resolved NO call between project declarations. A broken oracle, not a clean project.'); process.exit(1); }

// --- conducks: analyze a copy (see oracle-java-dead.mjs for why a non-git subject is copied) -------
let dir = projectDir, scratch = null;
if (!existsSync(path.join(projectDir, '.git'))) {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'conducks-java-calls-'));
  dir = path.join(scratch, 'subject');
  cpSync(projectDir, dir, { recursive: true, filter: src => !src.includes(`${path.sep}.conducks`) });
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=oracle', '-c', 'user.email=oracle@local', 'commit', '-qm', 'subject']])
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}
let graph;
try {
  resetVault(dir);
  execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: dir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  const { registry } = await import(path.join(BUILD, 'registry/index.js'));
  registry.infrastructure.setQuiet(true);
  const persistence = registry.infrastructure.createPersistence(dir, true);
  registry.infrastructure.anchorTo(dir);
  await persistence.load(registry.query.graph.getGraph());
  graph = registry.query.graph.getGraph();
} finally {
  if (scratch) process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
}

const rootLower = dir.toLowerCase().replace(/\/$/, '') + '/';
/** `rel/path.java::chain` from a conducks id, or null for a node outside the project's Java files. */
const keyOf = (id) => {
  const s = String(id);
  const i = s.indexOf('::');
  if (i < 0 || !s.toLowerCase().startsWith(rootLower)) return null;
  const file = s.slice(0, i).toLowerCase();
  if (!file.endsWith('.java')) return null;
  return `${file.slice(rootLower.length)}::${s.slice(i + 2).toLowerCase()}`;
};
const javaKey = (file, chain) => `${file.toLowerCase()}::${chain}`;

// conducks call edges, indexed by caller.
const CALL_TYPES = new Set(['CALLS', 'CONSTRUCTS']);
const conducksBySource = new Map();
let conducksEdges = 0;
for (const e of graph.getAllEdges()) {
  if (!CALL_TYPES.has(e.type)) continue;
  const src = keyOf(e.sourceId);
  if (!src) continue;
  const target = graph.getNode(e.targetId);
  const tgt = target ? keyOf(e.targetId) : null;
  const name = String(e.properties?.original ?? target?.properties?.name ?? String(e.targetId).split(/[.:]/).pop()).split('.').pop().toLowerCase();
  const list = conducksBySource.get(src) ?? [];
  list.push({ tgt, name, bound: !!target, type: e.type });
  conducksBySource.set(src, list);
  conducksEdges++;
}
const nodeKeys = new Set();
for (const n of graph.getAllNodes()) { const k = keyOf(n.id); if (k) nodeKeys.add(k); }

// javac pairs, de-duplicated (several call lines between one pair are one edge).
const pairs = new Map();
for (const e of o.edges) {
  const src = javaKey(e.fromFile, e.from);
  const targets = e.kind === 'new' ? [javaKey(e.toFile, e.toClass), javaKey(e.toFile, e.to)] : [javaKey(e.toFile, e.to)];
  const k = `${src}->${targets[0]}`;
  if (!pairs.has(k)) pairs.set(k, { src, targets, name: e.name.toLowerCase(), kind: e.kind, at: `${e.fromFile}:${e.line}` });
}

// `m` overrides `x`, transitively: an edge to m where javac says x is dispatch to a subtype.
const overridesOf = new Map();
for (const r of o.overrides ?? []) {
  const k = r.method.toLowerCase();
  (overridesOf.get(k) ?? overridesOf.set(k, new Set()).get(k)).add(r.overrides.toLowerCase());
}
const overrides = (m, x) => {
  const seen = new Set(); const todo = [m];
  while (todo.length) { for (const up of overridesOf.get(todo.pop()) ?? []) { if (up === x) return true; if (!seen.has(up)) { seen.add(up); todo.push(up); } } }
  return false;
};
// --- recall ---------------------------------------------------------------------------------------
const recall = { exact: [], dispatch: [], wrong: [], unbound: [], missing: [], noCaller: [] };
for (const p of pairs.values()) {
  const out = conducksBySource.get(p.src);
  if (!nodeKeys.has(p.src)) { recall.noCaller.push(p); continue; }
  if (out?.some(c => c.tgt && p.targets.includes(c.tgt))) { recall.exact.push(p); continue; }
  if (out?.some(c => c.tgt && c.name === p.name && p.targets.some(x => overrides(c.tgt, x)))) { recall.dispatch.push(p); continue; }
  const named = (out ?? []).filter(c => c.name === p.name);
  if (named.some(c => c.bound && c.tgt)) recall.wrong.push({ ...p, got: named.filter(c => c.tgt).map(c => c.tgt) });
  else if (named.length) recall.unbound.push(p);
  else recall.missing.push(p);
}

// --- precision ------------------------------------------------------------------------------------
const javacBySrcName = new Map();
for (const p of pairs.values()) {
  const k = `${p.src}|${p.name}`;
  const set = javacBySrcName.get(k) ?? new Set();
  for (const t of p.targets) set.add(t);
  javacBySrcName.set(k, set);
}
const precision = { right: 0, dispatch: 0, wrong: [], unverifiable: 0 };
for (const [src, list] of conducksBySource) {
  for (const c of list) {
    if (!c.tgt) continue;                              // unbound or external: not an edge between project nodes
    const expected = javacBySrcName.get(`${src}|${c.name}`);
    if (!expected) { precision.unverifiable++; continue; }
    if (expected.has(c.tgt)) precision.right++;
    else if ([...expected].some(x => overrides(c.tgt, x))) precision.dispatch++;
    else precision.wrong.push({ src, name: c.name, got: c.tgt, expected: [...expected] });
  }
}

// --- report ---------------------------------------------------------------------------------------
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
const total = pairs.size;
console.log(`\n--- Java call edges vs javac (${path.basename(projectDir)}) ---`);
console.log(`  files attributed : ${o.files}  (javac errors without a classpath: ${o.errors})`);
console.log(`  javac call pairs between project declarations: ${total}  (${o.edges.length} call sites)`);
console.log(`  RECALL   exact ${recall.exact.length} (${pct(recall.exact.length, total)})  ·  to an override (dispatch) ${recall.dispatch.length}  ·  wrong target ${recall.wrong.length}  ·  unbound ${recall.unbound.length}  ·  missing ${recall.missing.length}  ·  caller not a node ${recall.noCaller.length}`);
const show = (label, list, f) => { if (!list.length) return; console.log(`    ${label}:`); for (const x of list.slice(0, 12)) console.log(`      ${f(x)}`); if (list.length > 12) console.log(`      … ${list.length - 12} more`); };
show('wrong target', recall.wrong, p => `${p.at}  ${p.src.split('::')[1]} → ${p.targets[0]}  (conducks: ${p.got.join(', ')})`);
show('unbound', recall.unbound, p => `${p.at}  ${p.kind} ${p.src.split('::')[1]} → ${p.targets[0]}`);
show('missing', recall.missing, p => `${p.at}  ${p.kind} ${p.src.split('::')[1]} → ${p.targets[0]}`);
show('caller not a node', recall.noCaller, p => `${p.at}  ${p.src}`);
console.log(`  PRECISION of ${conducksEdges} conducks call edges from Java callers: right ${precision.right}  ·  dispatch ${precision.dispatch}  ·  WRONG ${precision.wrong.length}  ·  unverifiable ${precision.unverifiable}  → ${pct(precision.right + precision.dispatch, precision.right + precision.dispatch + precision.wrong.length)} of the verifiable`);
show('wrong', precision.wrong, w => `${w.src} —${w.name}→ ${w.got}  (javac: ${w.expected.join(' | ')})`);

const BASELINE = path.join(HERE, 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::java-calls`;
const now = { pairs: total, exact: recall.exact.length, recallWrong: recall.wrong.length, precisionWrong: precision.wrong.length };
if (process.argv.includes('--write-baseline')) {
  baseline[key] = now;
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
const prev = baseline[key];
if (!prev) { console.log(`\n  ✖ NO BASELINE for '${key}' — re-run with --write-baseline to record one deliberately.\n`); process.exit(1); }
const fails = [];
if (now.exact < prev.exact) fails.push(`exact ${prev.exact} → ${now.exact}`);
if (now.recallWrong > prev.recallWrong) fails.push(`wrong-target calls ${prev.recallWrong} → ${now.recallWrong}`);
if (now.precisionWrong > prev.precisionWrong) fails.push(`wrong edges ${prev.precisionWrong} → ${now.precisionWrong}`);
if (fails.length) { console.error(`\n✖ CALL EDGES WENT BACKWARDS: ${fails.join('; ')}`); process.exit(1); }
console.log(`\n✓ call edges did not regress against javac.\n`);
process.exit(0);
