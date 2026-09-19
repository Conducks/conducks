#!/usr/bin/env node
/**
 * Conducks — the drift benchmark. Renames it must count exactly once, and verdicts it must not fake.
 *
 * `oracle-drift.mjs` scores `drift` against whatever two pulses a vault happens to hold. This plants
 * the pulse PAIR on purpose, because every measured defect in this command lives in a shape no real
 * corpus reliably contains: two functions with the SAME SHAPE and different names, one of them
 * renamed. That single fixture caught three separate bugs, and each one is a scenario below.
 *
 * WHAT `drift` CLAIMS, quoted from `src/lib/domain/evolution/drift-engine.ts`:
 *
 *   "Compares the current pulse against a previous one. If pulseId is not provided, uses the two
 *    most recent pulses."
 *
 * and, in code: velocity = (Δgravity * 0.5) + (Δcomplexity * 0.5); DECAYING above 0.05, IMPROVING
 * below -0.05; a rename is a symbol that APPEARED paired 1:1 with a symbol that VANISHED sharing a
 * shape fingerprint; and a verdict that was not reached is STATUS INSUFFICIENT_DATA with exit 1,
 * never STABLE.
 *
 * The three measured rename bugs, planted as 01, 02, 03:
 *   - joining on the `fingerprint` column (which hashes path|name|dna) can only find a symbol that
 *     moved while KEEPING its name, so a renamed leaf function reported "Renamed/Moved: 0"
 *   - the disappearance guard was one-sided: a symbol that still exists, untouched, stayed eligible
 *     as a rename SOURCE, so renaming one of two same-shape functions reported TWO renames — the
 *     real one, plus one whose source is still sitting in the file
 *   - the shape join is many-to-many, so renaming BOTH of two same-shape functions reported FOUR
 *     renames, every (new, old) combination including the two that are provably wrong
 *
 * Every scenario carries its counter-half, because a rename detector that pairs everything with
 * everything passes every recall test: 04 demands ZERO renames from a pulse pair where nothing moved,
 * and 08 demands an IMPROVING verdict from the same machinery that produces 07's DECAYING one.
 *
 * WHAT THIS FILE DOES NOT TEST, stated rather than discovered later:
 *   - the `UNAVAILABLE` status. It needs the vault query to throw, which no fixture can arrange
 *     without editing the engine. Only a mutation reaches that branch — it is unscored here.
 *   - WHICH rename is which inside a group of identical-shape symbols. The engine says so itself:
 *     "same shape, same metrics, different names is all the graph knows". Scenario 03 therefore
 *     scores the COUNT and that each symbol appears exactly once, never the individual pairing.
 *   - the exact threshold value. 0.05 is a policy; what is scored is that ONE number serves both
 *     the printed sentence and the summary (the todo26 defect: 3 and 153 on the same screen).
 *   - `analyze`'s own correctness. If it wrote a wrong complexity, every scenario here agrees with it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/**
 * Two functions with the SAME BODY and different names — the fixture that caught three bugs.
 * `caller` exists so the module is not a lone leaf and the shapes get real gravity.
 */
const TWIN = (aName, bName) => ({
  'src/paths.py': `def ${aName}():\n    return "/tmp"\n\ndef ${bName}():\n    return "/tmp"\n`,
  'src/use.py': `from paths import ${aName}\n\ndef caller():\n    return ${aName}()\n`,
});

const SCENARIOS = [
  // ── L2: renames it must find, counted exactly once ────────────────────────
  {
    name: '01 a renamed function is reported as exactly one rename',
    why: 'MEASURED on the orchestrator subject: conducks renamed a function at 5 sites and drift answered "stable … Renamed/Moved: 0". The join was on `fingerprint`, which hashes path|name|dna — a column that changes WHEN THE NAME CHANGES, so it could only ever find a move that kept its name',
    files: { 'src/paths.py': 'def get_project_root():\n    return "/tmp"\n', 'src/use.py': 'from paths import get_project_root\n\ndef caller():\n    return get_project_root()\n' },
    after: { 'src/paths.py': 'def get_root_directory():\n    return "/tmp"\n', 'src/use.py': 'from paths import get_root_directory\n\ndef caller():\n    return get_root_directory()\n' },
    check: ({ json, fail }) => {
      if (json.summary.move_count !== 1) fail(`expected exactly 1 rename, got ${json.summary.move_count}: ${JSON.stringify(json.moves.map(m => `${m.from} → ${m.to}`))}`);
      const m = json.moves[0];
      if (m && !String(m.from).endsWith('::get_project_root')) fail(`rename source must be get_project_root, got ${m.from}`);
      if (m && !String(m.to).endsWith('::get_root_directory')) fail(`rename target must be get_root_directory, got ${m.to}`);
    },
  },
  {
    name: '02 renaming ONE of two identical-shape functions reports ONE rename, not two',
    why: 'MEASURED: two same-shape Python functions, rename only get_project_root, and drift reported TWO renames — the real one plus get_data_dir → get_root_directory, where get_data_dir was never touched and is still right there in the file. A rename needs BOTH ends: a name that appeared AND a name that vanished',
    files: TWIN('get_project_root', 'get_data_dir'),
    after: {
      'src/paths.py': 'def get_root_directory():\n    return "/tmp"\n\ndef get_data_dir():\n    return "/tmp"\n',
      'src/use.py': 'from paths import get_root_directory\n\ndef caller():\n    return get_root_directory()\n',
    },
    check: ({ json, fail }) => {
      const pairs = json.moves.map(m => `${String(m.from).split('::').pop()} → ${String(m.to).split('::').pop()}`);
      if (json.summary.move_count !== 1) fail(`expected exactly 1 rename, got ${json.summary.move_count}: ${JSON.stringify(pairs)}`);
      if (json.moves.some(m => String(m.from).endsWith('::get_data_dir')))
        fail(`get_data_dir is untouched and still in the file — it cannot be a rename SOURCE: ${JSON.stringify(pairs)}`);
    },
  },
  {
    name: '03 renaming BOTH identical-shape functions reports TWO renames, not four',
    why: 'MEASURED: two same-shape functions renamed in ONE commit reported FOUR renames — every (new, old) combination, two of them provably wrong. The disappearance guard does not help here: both old symbols genuinely vanished, so all four pairs are legal to SQL. Each real rename must consume one end on each side',
    files: TWIN('get_project_root', 'get_data_dir'),
    after: {
      'src/paths.py': 'def get_root_directory():\n    return "/tmp"\n\ndef get_data_path():\n    return "/tmp"\n',
      'src/use.py': 'from paths import get_root_directory\n\ndef caller():\n    return get_root_directory()\n',
    },
    check: ({ json, fail }) => {
      const pairs = json.moves.map(m => `${String(m.from).split('::').pop()} → ${String(m.to).split('::').pop()}`);
      if (json.summary.move_count !== 2) fail(`expected exactly 2 renames, got ${json.summary.move_count}: ${JSON.stringify(pairs)}`);
      const froms = json.moves.map(m => String(m.from)), tos = json.moves.map(m => String(m.to));
      if (new Set(froms).size !== froms.length) fail(`a rename SOURCE was spent twice: ${JSON.stringify(pairs)}`);
      if (new Set(tos).size !== tos.length) fail(`a rename TARGET was spent twice: ${JSON.stringify(pairs)}`);
    },
  },

  // ── L3: the counter-halves ────────────────────────────────────────────────
  {
    name: '04 a pulse pair with nothing moved reports no renames and no decay',
    why: 'the counter-half of 01-03 and the one they all pass without. A pairing that matches every shape to every other shape finds renames here too — this fixture has two identical-shape functions sitting still, which is exactly the bait',
    files: TWIN('get_project_root', 'get_data_dir'),
    after: { 'src/use.py': 'from paths import get_project_root\n\ndef caller():\n    # a comment, and nothing structural\n    return get_project_root()\n' },
    check: ({ json, fail }) => {
      if (json.summary.move_count !== 0) fail(`nothing was renamed, ${json.summary.move_count} reported: ${JSON.stringify(json.moves.map(m => `${m.from} → ${m.to}`))}`);
      if (json.summary.decay_count !== 0) fail(`nothing changed, ${json.summary.decay_count} symbols reported decaying`);
      if (json.status !== 'STABLE') fail(`expected STABLE, got ${json.status}`);
    },
  },
  {
    name: '05 growth is DECAYING, and the symbol that grew is the one listed',
    why: 'the verdict half. A count with no listing is unfalsifiable — `Decaying: N` printed alone was the F-06b defect on the improving side — so the symbol that actually gained branches has to appear in the deltas above the threshold',
    // TWO symbols decay, by DIFFERENT amounts, on purpose: with one decaying symbol the ordering
    // assertion below is satisfied by any list at all, and a dropped sort would stay green.
    files: {
      'src/m.py': 'def grows(items):\n    t = 0\n    for i in items:\n        t += i\n    return t\n',
      'src/n.py': 'def creeps(items):\n    t = 0\n    for i in items:\n        t += i\n    return t\n',
    },
    after: {
      'src/m.py': 'def grows(items):\n    t = 0\n    for i in items:\n        if i > 0:\n            t += i\n        elif i == 0:\n            t += 100\n        elif i == 1:\n            t += 7\n        elif i == 2:\n            t += 9\n        else:\n            t -= 1\n    return t\n',
      'src/n.py': 'def creeps(items):\n    t = 0\n    for i in items:\n        if i > 0:\n            t += i\n    return t\n',
    },
    check: ({ json, fail, cli }) => {
      if (json.status !== 'DECAYING') fail(`expected DECAYING, got ${json.status} — ${json.message}`);
      if (!(json.summary.decay_count >= 1)) fail(`decay_count = ${json.summary.decay_count}`);
      if (!/decay/i.test(json.message)) fail(`status is DECAYING and the message never says so: "${json.message}"`);
      // The LISTING is scored on the rendered surface, because that is the surface that claims to be
      // one: "ONE THRESHOLD, AND SORTED … a heading reading Top printed whatever order the deltas
      // arrived in". The heading is `Top Structural Decay Hotspots`, so the symbol counted as
      // decaying must be under it.
      const rendered = cli(['drift']).out.replace(/\x1b\[[0-9;]*m/g, '');
      if (!/Top Structural Decay Hotspots/.test(rendered)) fail(`decay_count is ${json.summary.decay_count} and no hotspot block was printed`);
      if (!/^1\. grows /m.test(rendered)) fail(`grows gained four branches to creeps' one and must HEAD the hotspot list:\n${rendered}`);
      if (!/^2\. creeps /m.test(rendered)) fail(`creeps also decayed and must be listed second:\n${rendered}`);
      if (json.summary.decay_count !== 2) fail(`two symbols gained branches, decay_count = ${json.summary.decay_count}`);
      // MEASURED AND DELIBERATELY NOT ASSERTED: `deltas` in `--json` is `result.deltas.slice(0, 10)`
      // in ARRIVAL order — unfiltered and unsorted — so on this very fixture it holds ten velocity-0
      // taxonomy rows and `grows` is not among them, while `improving` two fields away IS filtered
      // and sorted (the F-06b fix, applied to one side only). The field sets `truncated: true`, so it
      // does not LIE; it is simply useless to a machine caller, who can read `decay_count: 1` and
      // then find no decaying symbol in the array beside it. Scenario 06 passes off `improving` for
      // exactly the shape this scenario cannot get off `deltas`. Asserted nowhere because the field
      // makes no ordering claim — reported as a defect instead.
    },
  },
  {
    name: '06 shrinking is IMPROVING, and the symbol that shrank is listed',
    why: 'the counter-half of 05, and the F-06b defect: `Improving: N` was printed with no per-symbol listing anywhere, so the count was real and unfalsifiable. A detector that calls every change decay passes 05 and fails only here',
    files: { 'src/m.py': 'def shrinks(items):\n    t = 0\n    for i in items:\n        if i > 0:\n            t += i\n        elif i == 0:\n            t += 100\n        else:\n            t -= 1\n    return t\n' },
    after: { 'src/m.py': 'def shrinks(items):\n    t = 0\n    for i in items:\n        t += i\n    return t\n' },
    check: ({ json, fail }) => {
      if (!(json.summary.improvement_count >= 1)) fail(`improvement_count = ${json.summary.improvement_count}, status ${json.status} — ${json.message}`);
      const hit = (json.improving ?? []).find(d => String(d.id).endsWith('::shrinks'));
      if (!hit) fail(`shrinks must be listed in improving — listed: ${(json.improving ?? []).map(d => d.name).join(', ') || 'nothing'}`);
      else if (!(hit.velocity < -0.05)) fail(`shrinks velocity ${hit.velocity} does not clear the improvement threshold it was counted at`);
    },
  },
  {
    name: '07 a pulse the vault does not hold gets no verdict, and exits non-zero',
    why: 'ADR 0127: `conducks drift pulse_nope` printed "no drift verdict was reached" and exited 0, so a script could not tell it from "stable". A verdict that was not reached is not a pass',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n' },
    after: { 'src/m.py': 'def a(x):\n    # comment\n    return x + 1\n' },
    check: ({ fail, cli }) => {
      const r = cli(['drift', 'pulse_does_not_exist', '--json']);
      if (r.code === 0) fail(`exited 0 for a pulse the vault does not hold`);
      const j = JSON.parse(r.out.slice(r.out.indexOf('{')));
      if (j.status !== 'INSUFFICIENT_DATA') fail(`expected INSUFFICIENT_DATA, got ${j.status}`);
      if (j.status === 'STABLE') fail(`a comparison against nothing reported STABLE`);
    },
  },
  {
    name: '08 a vault with ONE pulse gets no verdict, and exits non-zero',
    why: 'the state every fresh project is in, and the state this repository own vault was in when it reported "stable across 0 symbols" over 70 pulses. Nothing to compare must read as nothing to compare',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n' },
    after: null, // no second analyze — this scenario is ABOUT the single-pulse vault
    check: ({ fail, cli }) => {
      const r = cli(['drift', '--json']);
      if (r.code === 0) fail(`exited 0 with a single pulse in the vault`);
      const j = JSON.parse(r.out.slice(r.out.indexOf('{')));
      if (j.status !== 'INSUFFICIENT_DATA') fail(`expected INSUFFICIENT_DATA, got ${j.status}`);
      if (/resonance stable/i.test(String(j.message))) fail(`reported stability from a comparison that never ran: "${j.message}"`);
    },
  },
  {
    name: '09 a directory argument is a project, not a pulse id',
    why: 'the dispatcher ALSO reads the first positional as the target root, so `conducks drift <path>` passed the path in as a pulse id and the run reported "check that node_history holds rows for pulse /private/tmp/…". A real comparison was refused because of how it was invoked',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n' },
    after: { 'src/m.py': 'def a(x):\n    # comment\n    return x + 1\n' },
    check: ({ fail, cli, repo }) => {
      const r = cli(['drift', repo, '--json']);
      const j = JSON.parse(r.out.slice(r.out.indexOf('{')));
      if (j.status === 'INSUFFICIENT_DATA' && /holds rows for pulse \//.test(String(j.message)))
        fail(`the path was read as a pulse id: "${j.message}"`);
      if (j.status !== 'STABLE' && j.status !== 'DECAYING') fail(`expected a real verdict, got ${j.status} — ${j.message}`);
    },
  },
  {
    name: '10 rows that could not be checked are named, not folded into "stable"',
    why: 'todo26: UNIT nodes are fingerprint-less by design, and `null !== null` is false in JS, so they reported isModified=false — a row that was never checked, presented as a row that was checked and found clean. The message has to say so or "stable" is a claim about symbols nobody looked at',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n' },
    after: { 'src/m.py': 'def a(x):\n    # comment\n    return x + 1\n' },
    check: ({ json, fail }) => {
      if (!(json.summary.identity_gap_count > 0)) fail(`this fixture has fingerprint-less UNIT nodes; identity_gap_count = ${json.summary.identity_gap_count}`);
      if (!/no fingerprint/.test(String(json.message)))
        fail(`${json.summary.identity_gap_count} rows were never checked and the message does not say so: "${json.message}"`);
    },
  },
];

function build(repo, files) {
  for (const [rel, body] of Object.entries(files ?? {})) {
    const abs = path.join(repo, rel);
    if (body === null) { rmSync(abs, { force: true }); continue; }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

async function pulseCount(repo) {
  const db = await DuckDBInstance.create(path.join(repo, '.conducks', 'conducks-synapse.db'));
  const conn = await db.connect();
  const rows = await (await conn.run('SELECT id FROM pulses')).getRowObjects();
  try { conn.closeSync?.(); db.closeSync?.(); } catch { /* done */ }
  return rows.length;
}

async function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-drift-'));
  try {
    build(repo, s.files);
    for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
      execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
    }
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    if (s.after) {
      build(repo, s.after);
      execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'c', '--allow-empty'], { cwd: repo, stdio: 'ignore' });
      execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    }

    const failures = [];
    const fail = (m) => failures.push(m);
    const cli = (args) => {
      const r = spawnSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return { out: `${r.stdout ?? ''}${r.stderr ?? ''}`, code: r.status };
    };

    // A scenario that meant to build a pulse PAIR and got one pulse scored nothing (ADR 0044).
    const pulses = await pulseCount(repo);
    if (s.after && pulses < 2) { fail(`the vault holds ${pulses} pulse(s) — no pulse pair to compare, so nothing was scored`); return failures; }

    let json = null;
    if (s.after) {
      const r = cli(['drift', '--json']);
      json = JSON.parse(r.out.slice(r.out.indexOf('{')));
    }
    s.check({ json, fail, cli, repo });
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the drift benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = await runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ drift fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ drift answers every scenario as its own claims say it should.\n`);
