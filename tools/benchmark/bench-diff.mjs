#!/usr/bin/env node
/**
 * Conducks — the diff benchmark. Deltas it must see, and a quiet pair it must NOT inflate.
 *
 * `oracle-diff.mjs` scores `diff --base` against whatever two pulses a vault happens to hold. This
 * plants the pulse PAIR on purpose — a symbol that appeared, one that vanished, one that only grew,
 * and a pair where nothing structural happened at all — because the last of those is the shape the
 * command got catastrophically wrong and no real corpus reliably contains.
 *
 * WHAT `diff --base` CLAIMS, quoted from `src/interfaces/cli/commands/diff.ts`:
 *
 *   "`node_history` is the table that keeps per-pulse rows … There is NO edge history, so
 *    relationship counts are not reported rather than invented — what is retained is stated in the
 *    output instead of implied."
 *
 * and the defect it was built to fix (ADR 0122): the base graph loaded EMPTY, so two pulses three
 * minutes apart reported `+5472/-0 Symbols`, and a pulse id that did not exist produced the
 * identical answer. Scenario 03 and scenario 04 are those two failures, planted.
 *
 * RELATIONSHIP DELTAS ARE NOT SCORED, because they are not retained. Nothing in this file can check
 * an edge appeared; what IS checked is that the command keeps saying so instead of inventing one.
 *
 * Every scenario carries its counter-half: for each thing `diff` must report there is a thing it
 * must NOT, because a diff that calls every symbol new passes every recall test ever written — and
 * that is not a hypothetical, it is what this command actually did.
 *
 * WHAT THIS FILE DOES NOT TEST: the git path (`conducks diff` with no `--base`), which is a
 * different command computing a risk score from working-tree hunks, and the 50-row cap on the
 * `changed` list, which no scenario here is large enough to reach.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** A repo whose second pulse only differs by a comment — the vault writes a pulse, the symbols are identical. */
const QUIET_BEFORE = { 'src/m.py': 'def a(x):\n    return x + 1\n' };
const QUIET_AFTER = { 'src/m.py': 'def a(x):\n    # a comment, and nothing structural\n    return x + 1\n' };

const SCENARIOS = [
  // ── L2: deltas it must see ────────────────────────────────────────────────
  {
    name: '01 a symbol that appeared is reported added, and its untouched neighbour is not',
    why: 'the base claim, with its counter-half in the same scenario: a diff that lists every symbol as added also passes the first half',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n' },
    after: { 'src/new.py': 'def fresh(y):\n    return y * 3\n' },
    check: ({ json, fail }) => {
      const added = json.nodes.added.map(r => r.id);
      if (!added.some(id => id.endsWith('::fresh'))) fail(`fresh must be reported added — added: ${added.join(', ') || 'nothing'}`);
      if (added.some(id => id.endsWith('::a'))) fail(`the untouched symbol a must NOT be reported added`);
      if (json.nodes.removed.length !== 0) fail(`nothing was deleted, ${json.nodes.removed.length} reported removed`);
    },
  },
  {
    name: '02 a symbol that vanished is reported removed, and nothing else is',
    why: 'the mirror of 01. A removal is the half that cannot be faked by an empty base graph — an empty base makes everything ADDED and nothing removed, so this direction has to be asked separately',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n', 'src/gone.py': 'def doomed(y):\n    return y\n' },
    // The comment edit on the SURVIVING file is not decoration. MEASURED while building this file:
    // `analyze` is deletion-blind — delete a file and nothing else, and the run prints "No changes
    // detected … already at 100% resonance" and writes NO second pulse, so there is no pulse pair to
    // diff. The co-edit forces the pulse; the deletion is still the only thing scored.
    after: { 'src/gone.py': null, 'src/m.py': 'def a(x):\n    # forces a pulse; analyze does not notice a deletion on its own\n    return x + 1\n' },
    check: ({ json, fail }) => {
      const removed = json.nodes.removed.map(r => r.id);
      if (!removed.some(id => id.endsWith('::doomed'))) fail(`doomed must be reported removed — removed: ${removed.join(', ') || 'nothing'}`);
      if (removed.some(id => id.endsWith('::a'))) fail(`the untouched symbol a must NOT be reported removed`);
      if (json.nodes.added.length !== 0) fail(`nothing was created, ${json.nodes.added.length} reported added`);
    },
  },
  {
    name: '03 a pulse pair with no structural change reports no symbols added or removed',
    why: 'THE ADR 0122 REGRESSION, planted. The base graph loaded empty from `nodes` (swept per pulse), so two consecutive pulses reported +5472/-0 on this very repository. Every recall scenario above passes with that bug present; only this one fails',
    files: QUIET_BEFORE,
    after: QUIET_AFTER,
    check: ({ json, fail }) => {
      if (json.nodes.addedCount !== 0) fail(`${json.nodes.addedCount} symbols reported added between two pulses that differ by a comment`);
      if (json.nodes.removedCount !== 0) fail(`${json.nodes.removedCount} symbols reported removed between two pulses that differ by a comment`);
      if (json.baseNodeCount === 0) fail(`baseNodeCount is 0 — the base pulse was not loaded, which is exactly how the +5472/-0 answer was produced`);
      if (json.baseNodeCount !== json.headNodeCount) fail(`baseNodeCount ${json.baseNodeCount} != headNodeCount ${json.headNodeCount} with an identical symbol set`);
    },
  },
  {
    name: '04 growth is attributed to the symbol that grew, and to no other',
    why: 'complexityBloat is the field a reviewer acts on. Attributing it to the wrong symbol is worse than not reporting it, and an all-symbols-changed answer passes any check that only asks "is it listed"',
    files: {
      'src/m.py': 'def grows(items):\n    t = 0\n    for i in items:\n        t += i\n    return t\n',
      'src/other.py': 'def steady(x):\n    return x\n',
    },
    after: {
      'src/m.py': 'def grows(items):\n    t = 0\n    for i in items:\n        if i > 0:\n            t += i\n        elif i == 0:\n            t += 100\n        else:\n            t -= 1\n    return t\n',
    },
    check: ({ json, fail }) => {
      const hit = json.changed.find(c => c.id.endsWith('::grows'));
      if (!hit) fail(`grows must appear in changed — changed: ${json.changed.map(c => c.name).join(', ') || 'nothing'}`);
      else if (!(hit.complexityBloat > 0)) fail(`grows gained branches, complexityBloat = ${hit.complexityBloat}`);
      if (json.changed.some(c => c.id.endsWith('::steady'))) fail(`steady was not touched and must not be reported as changed`);
    },
  },
  {
    name: '05 --head is honoured: swapping base and head swaps added and removed',
    why: '`--head` was once read ONLY inside the `--base` branch and silently ignored. A run that reports the right delta while ignoring the pulse it was told to compare TO is right by accident — this asks the same pair backwards and demands the mirror answer',
    files: { 'src/m.py': 'def a(x):\n    return x + 1\n' },
    after: { 'src/new.py': 'def fresh(y):\n    return y * 3\n' },
    check: ({ json, fail, cli, pulses }) => {
      if (!json.nodes.added.some(r => r.id.endsWith('::fresh'))) fail(`forward run must report fresh added`);
      const back = cli(['diff', '--base', pulses.at(-1), '--head', pulses[0], '--json']);
      if (back.code !== 0) fail(`reversed run exited ${back.code}`);
      const rev = JSON.parse(back.out.slice(back.out.indexOf('{')));
      if (!rev.nodes.removed.some(r => r.id.endsWith('::fresh')))
        fail(`with base=new head=old, fresh must be REMOVED — got added ${rev.nodes.addedCount}, removed ${rev.nodes.removedCount}`);
      if (rev.nodes.added.some(r => r.id.endsWith('::fresh')))
        fail(`fresh reported added in the reversed direction — --head is being ignored`);
    },
  },

  // ── L3: answers it must REFUSE to give ────────────────────────────────────
  {
    name: '06 a base pulse the vault does not hold is refused, not answered',
    why: 'ADR 0122 headline: a fabricated pulse id produced an answer indistinguishable from a real comparison. Refusing by name is the only thing that separates them, and a zero exit code here would let a script treat a fiction as a measurement',
    files: QUIET_BEFORE,
    after: QUIET_AFTER,
    check: ({ fail, cli }) => {
      const r = cli(['diff', '--base', 'pulse_does_not_exist', '--json']);
      if (r.code === 0) fail(`exited 0 on a pulse id the vault does not hold`);
      if (/"addedCount"/.test(r.out)) fail(`printed a delta for a pulse that does not exist: ${r.out.slice(0, 120)}`);
    },
  },
  {
    name: '07 --head without --base is refused instead of silently running the git path',
    why: 'ADR 0122: `--head` alone was accepted and the command ran the WORKING-TREE risk engine instead. The caller asked to compare two pulses and got an answer about uncommitted edits — a different question, answered confidently, under the flags they typed',
    files: QUIET_BEFORE,
    after: QUIET_AFTER,
    check: ({ fail, cli, pulses }) => {
      const r = cli(['diff', '--head', pulses.at(-1), '--json']);
      if (r.code === 0) fail(`exited 0 with --head and no --base`);
      if (/Risk Profile|Risk Engine/.test(r.out)) fail(`fell through to the git risk engine: ${r.out.slice(0, 160)}`);
    },
  },
  {
    name: '08 --base with no id after it is refused',
    why: 'the flag-parsing counter-half of 06. `args[baseIdx + 1]` is `undefined` at the end of the argv, and an unguarded read would hand `undefined` to the vault query — which finds no rows and would have reported a delta against nothing, the same fiction by a different route',
    files: QUIET_BEFORE,
    after: QUIET_AFTER,
    check: ({ fail, cli }) => {
      const r = cli(['diff', '--base']);
      if (r.code === 0) fail(`exited 0 with --base and no pulse id`);
      const r2 = cli(['diff', '--base', '--json']);
      if (r2.code === 0) fail(`exited 0 with --base consuming the next FLAG as its id`);
    },
  },
];

function build(repo, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(repo, rel);
    if (body === null) { rmSync(abs, { force: true }); continue; }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

async function pulseIds(repo) {
  const db = await DuckDBInstance.create(path.join(repo, '.conducks', 'conducks-synapse.db'));
  const conn = await db.connect();
  const rows = await (await conn.run('SELECT id FROM pulses ORDER BY timestamp')).getRowObjects();
  try { conn.closeSync?.(); db.closeSync?.(); } catch { /* done */ }
  return rows.map(r => String(r.id));
}

async function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-diff-'));
  try {
    build(repo, s.files);
    for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
      execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
    }
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    build(repo, s.after);
    execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'c', '--allow-empty'], { cwd: repo, stdio: 'ignore' });
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });

    const pulses = await pulseIds(repo);
    const failures = [];
    const fail = (m) => failures.push(m);
    const cli = (args) => {
      const r = spawnSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return { out: `${r.stdout ?? ''}${r.stderr ?? ''}`, code: r.status };
    };

    // A scenario whose second analyze produced no second pulse is not testing a diff at all.
    if (pulses.length < 2) { fail(`the vault holds ${pulses.length} pulse(s) — no pulse pair to compare, so nothing was scored`); return failures; }

    const forward = cli(['diff', '--base', pulses[0], '--head', pulses.at(-1), '--json']);
    if (forward.code !== 0) { fail(`diff exited ${forward.code}: ${forward.out.slice(0, 200)}`); return failures; }
    const json = JSON.parse(forward.out.slice(forward.out.indexOf('{')));
    s.check({ json, fail, cli, pulses, repo });
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the diff benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = await runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ diff fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ diff answers every scenario as its own claims say it should.\n`);
