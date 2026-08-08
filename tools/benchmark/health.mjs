#!/usr/bin/env node
/**
 * Conducks — Benchmark B: conducks measured against itself, on frozen subjects.
 *
 * The problem this exists to solve is not speed. It is that every number this project reports has
 * been measured on a repository that changes under it. Node counts moved 5,412 -> 5,626 inside one
 * session, and a hardcoded expectation of 5,429 produced three FALSE failures before anyone noticed
 * the subject had moved rather than the tool. A benchmark whose subject changes measures nothing.
 *
 * So the subjects are pinned by git SHA (see projects.json) and the run REFUSES to proceed on a
 * dirty tree. A number that moves while the SHA holds is a change in conducks.
 *
 * THE DENOMINATOR TRAP. Every rate here is printed WITH its count, always, because a rate improves
 * when the denominator is destroyed: delete nodes and the dangling percentage falls while the graph
 * gets worse. This is not hypothetical — ADR 0077 records it happening. A run where the count moved
 * and the rate looked better is a regression until someone proves otherwise.
 *
 * WHAT THIS DOES NOT MEASURE. Correctness of an individual answer. That is Benchmark A's job, and it
 * needs hand-derived truth. This file measures shape, integrity and cost.
 *
 * Usage:
 *   node tools/benchmark/health.mjs                  every project, reanalyzing first
 *   node tools/benchmark/health.mjs --only scraper   one subject
 *   node tools/benchmark/health.mjs --no-analyze     reuse the vault that is already there
 *   node tools/benchmark/health.mjs --cold           delete the vault first — measure a FIRST analyze
 *   node tools/benchmark/health.mjs --save           write tools/benchmark/baselines/<name>.json
 *   node tools/benchmark/health.mjs --compare        diff against the saved baseline, exit 1 on drift
 *
 * WHICH ANALYZE THE BASELINE DESCRIBES (todo49 Phase 3). By default this runs `--force` over a vault
 * that already exists, so every saved baseline describes the SECOND analyze, not the first. That is
 * the run no user ever gets first, and it is structurally blind to the cold-start class of defect —
 * todo49 was exactly that: a first analyze produced fewer edges than a rebuild, and this harness
 * could not have seen it. `--cold` removes the vault before analyzing so the first run is the one
 * measured. Cold and warm now agree on all three subjects (todo49's fix), which is a property worth
 * re-checking rather than assuming: run `--cold --compare` against a warm baseline and drift is a
 * regression of that parity.
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import duckdb from 'duckdb';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const CLI = path.join(REPO, 'build/src/interfaces/cli/index.js');
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'projects.json'), 'utf8'));
const ROOT = path.resolve(HERE, CONFIG.root);
const BASELINES = path.join(HERE, 'baselines');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

const only = value('--only');
const doAnalyze = !flag('--no-analyze');
const cold = flag('--cold');
const save = flag('--save');
const compare = flag('--compare');

/**
 * The commands every subject must survive.
 *
 * This is a SMOKE list, not a correctness list. It answers one question — does the command exit 0
 * and print something on a codebase nobody tuned it against — which is exactly the question that
 * kept coming back "yes" on conducks itself and "no" everywhere else.
 */
const SMOKE = [
  ['status', []],
  ['audit', []],   // GATE — see GATES below

  ['entry', []],
  ['prune', []],
  ['flows', []],
  ['ledger', []],
  ['supply-chain', []],
  ['advise', []],
  ['query', ['--limit', '5', 'e']],
];

/**
 * Commands whose non-zero exit is a VERDICT, not a crash.
 *
 * `audit` exits 1 when it finds violations, which is what a gate is for. Counting that as a smoke
 * failure would report every honest codebase as breaking conducks — and it did, on two of the three
 * subjects, until this list existed. A gate may exit 0 or 1; anything above 1 is still a crash.
 */
const GATES = new Set(['audit', 'guard', 'docs-lint', 'prune']);
const crashed = (cmd, code) => (GATES.has(cmd) ? code > 1 : code !== 0);

const sh = (cmd, args, cwd) => {
  const started = process.hrtime.bigint();
  let code = 0, out = '';
  try {
    out = execFileSync('node', [CLI, cmd, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024,
    });
  } catch (e) {
    code = e.status ?? 1;
    out = String(e.stdout ?? '');
  }
  return { code, out, ms: Number((process.hrtime.bigint() - started) / 1_000_000n) };
};

const query = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

/** Ratio printed as a percentage, but the caller always carries the count beside it. */
const rate = (n, d) => (d === 0 ? null : Number(((n / d) * 100).toFixed(2)));

async function measure(project) {
  const dir = path.join(ROOT, project.name);
  if (!fs.existsSync(dir)) throw new Error(`subject missing: ${dir}`);

  // The subject must be frozen, or nothing downstream means anything.
  const head = execSync('git rev-parse --short HEAD', { cwd: dir, encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' })
    .split('\n').filter(l => l.trim() && !l.includes('.conducks')).length;
  if (head !== project.sha) throw new Error(`${project.name} is at ${head}, pinned at ${project.sha} — the subject moved, not the tool`);
  if (dirty > 0) throw new Error(`${project.name} has ${dirty} uncommitted change(s) — a dirty subject is not a frozen one`);

  const result = { project: project.name, sha: head, language: project.language };

  if (doAnalyze) {
    // A FIRST analyze, which the default path can never measure: without this the vault is always
    // already there, so the baseline describes the second run and the cold-start class of defect
    // (todo49) is invisible to this harness by construction. Safe on a frozen subject — the vault is
    // derived, excluded from the dirty check above, and rebuilt by the analyze on the next line.
    if (cold) fs.rmSync(path.join(dir, '.conducks'), { recursive: true, force: true });

    // --force, ALWAYS. Without it analyze reuses the vault when nothing changed, and on a subject
    // pinned by SHA nothing ever changes — so the timing collapses to the cost of deciding to skip.
    // Measured: scraper reported 932 ms incremental against 5,735 ms for the real work.
    const a = sh('analyze', ['.', '--yes', '--force'], dir);
    if (a.code !== 0) throw new Error(`${project.name}: analyze exited ${a.code}`);
    result.analyzeMs = a.ms;
    // Recorded in the result so a saved baseline SAYS which analyze it describes, rather than the
    // reader having to know how it was invoked.
    result.coldStart = cold;
  }

  // ---- shape, straight out of the vault ----
  const vault = path.join(dir, '.conducks/conducks-synapse.db');
  const db = new duckdb.Database(vault, duckdb.OPEN_READONLY).connect();

  const [counts] = await query(db, `
    SELECT
      COUNT(*)                                                     AS nodes,
      COUNT(*) FILTER (WHERE canonicalKind = 'UNIT')               AS units,
      COUNT(*) FILTER (WHERE doc IS NOT NULL AND doc <> '')        AS documented,
      -- LOCATED counts only what CAN have a line: a symbol declared in a file this repository owns
      -- and this parser reads. Counting everything reported 81% on orchestrator and read as a
      -- defect; the missing fifth was 488 directories, 42 npm packages and a folder of markdown,
      -- none of which is a line of code. Measured on the honest denominator it is 0 missing on all
      -- three subjects, so any number below 100% here is a real regression rather than noise.
      COUNT(*) FILTER (WHERE canonicalKind IN ('STRUCTURE', 'BEHAVIOR', 'ATOM')
                         AND file IS NOT NULL AND file <> '' AND file NOT LIKE 'external://%') AS locatable,
      COUNT(*) FILTER (WHERE canonicalKind IN ('STRUCTURE', 'BEHAVIOR', 'ATOM')
                         AND file IS NOT NULL AND file <> '' AND file NOT LIKE 'external://%'
                         AND lineStart IS NOT NULL AND lineStart > 0) AS located,
      COUNT(*) FILTER (WHERE canonicalKind = 'BEHAVIOR')           AS behaviors,
      COUNT(*) FILTER (WHERE canonicalKind = 'BEHAVIOR' AND doc IS NOT NULL AND doc <> '') AS documentedBehaviors
    FROM nodes`);
  const [edges] = await query(db, 'SELECT COUNT(*) AS edges FROM edges');

  result.nodes = Number(counts.nodes);
  result.units = Number(counts.units);
  result.edges = Number(edges.edges);

  // Counts and rates travel together. A rate alone can be improved by deleting the denominator.
  result.documented = { count: Number(counts.documented), of: result.nodes, pct: rate(Number(counts.documented), result.nodes) };
  result.documentedBehaviors = { count: Number(counts.documentedBehaviors), of: Number(counts.behaviors), pct: rate(Number(counts.documentedBehaviors), Number(counts.behaviors)) };
  result.located = { count: Number(counts.located), of: Number(counts.locatable), pct: rate(Number(counts.located), Number(counts.locatable)) };

  // ---- integrity ----
  const audit = sh('audit', ['--json'], dir);
  try {
    const a = JSON.parse(audit.out);
    const dangling = Number(a.stats?.ecosystem_dangling ?? 0);
    result.cycles = Number(a.stats?.cycles ?? 0);
    result.orphans = Number(a.stats?.orphans ?? 0);
    result.violations = (a.violations ?? []).length;
    result.dangling = { count: dangling, of: result.edges, pct: rate(dangling, result.edges) };
  } catch {
    result.auditParseFailed = true;
  }

  // ---- does every command survive an unfamiliar codebase ----
  result.smoke = {};
  for (const [cmd, args] of SMOKE) {
    const r = sh(cmd, args, dir);
    result.smoke[cmd] = { code: r.code, ms: r.ms, bytes: r.out.length };
  }
  result.smokeFailures = Object.entries(result.smoke).filter(([c, r]) => crashed(c, r.code)).map(([c]) => c);

  return result;
}

/** Only the fields where a change is a claim about conducks. Timings are reported, never compared. */
const COMPARED = ['nodes', 'units', 'edges', 'cycles', 'orphans', 'violations'];

function diff(now, before) {
  const out = [];
  for (const k of COMPARED) {
    if (before[k] !== undefined && now[k] !== before[k]) out.push(`${k}: ${before[k]} -> ${now[k]}`);
  }
  for (const k of ['documented', 'documentedBehaviors', 'located', 'dangling']) {
    const a = before[k], b = now[k];
    if (!a || !b) continue;
    if (a.count !== b.count || a.of !== b.of) out.push(`${k}: ${a.count}/${a.of} (${a.pct}%) -> ${b.count}/${b.of} (${b.pct}%)`);
  }
  const wasFailing = new Set(before.smokeFailures ?? []);
  for (const cmd of now.smokeFailures ?? []) if (!wasFailing.has(cmd)) out.push(`${cmd}: now exits non-zero`);
  for (const cmd of wasFailing) if (!(now.smokeFailures ?? []).includes(cmd)) out.push(`${cmd}: now exits 0 (was failing)`);
  return out;
}

const chosen = CONFIG.projects.filter(p => !only || p.name === only);
if (chosen.length === 0) { console.error(`no subject named "${only}"`); process.exit(2); }

let drifted = false;
for (const project of chosen) {
  let r;
  try {
    r = await measure(project);
  } catch (e) {
    console.error(`\n${project.name}: ${e.message}`);
    drifted = true;
    continue;
  }

  console.log(`\n=== ${r.project} @ ${r.sha} (${r.language}) ===`);
  if (r.analyzeMs) console.log(`  analyze         ${r.analyzeMs} ms`);
  console.log(`  nodes / edges   ${r.nodes} / ${r.edges}   (units ${r.units})`);
  console.log(`  documented      ${r.documented.count}/${r.documented.of} (${r.documented.pct}%)   behaviors ${r.documentedBehaviors.count}/${r.documentedBehaviors.of} (${r.documentedBehaviors.pct}%)`);
  console.log(`  located         ${r.located.count}/${r.located.of} (${r.located.pct}%)`);
  if (r.dangling) console.log(`  dangling        ${r.dangling.count}/${r.dangling.of} (${r.dangling.pct}%)   cycles ${r.cycles}  orphans ${r.orphans}  violations ${r.violations}`);
  console.log(`  smoke           ${Object.keys(r.smoke).length - r.smokeFailures.length}/${Object.keys(r.smoke).length} survived${r.smokeFailures.length ? `  CRASHED: ${r.smokeFailures.join(', ')}` : ''}`);

  const file = path.join(BASELINES, `${r.project}.json`);
  if (compare) {
    if (!fs.existsSync(file)) { console.log('  no baseline saved — run with --save'); continue; }
    const d = diff(r, JSON.parse(fs.readFileSync(file, 'utf8')));
    if (d.length === 0) console.log('  vs baseline     unchanged');
    else { drifted = true; console.log('  vs baseline     DRIFT'); d.forEach(l => console.log(`      ${l}`)); }
  }
  if (save) {
    fs.mkdirSync(BASELINES, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(r, null, 2) + '\n');
    console.log(`  saved           ${path.relative(REPO, file)}`);
  }
}

process.exit(compare && drifted ? 1 : 0);
