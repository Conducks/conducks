#!/usr/bin/env node
/**
 * Conducks — the guard benchmark. Breaches it must block on, and legal edges it must not.
 *
 * `oracle-guard.mjs` scores `guard` against whatever a real project happens to contain, and on this
 * repository the honest answer is "zero illegal layer pairs" — which is the right answer and proves
 * nothing about the gate. A gate that never fires and a gate that cannot fire print the same tick.
 * This plants each edge the contract names, in a tree shaped so the hardcoded LAYER_FRAGMENTS
 * actually match, and checks the exit code as well as the text.
 *
 * WHAT `guard` CLAIMS, and therefore what is scored:
 *   governance/index.ts:349 — "an import edge from layer A to layer B is legal only if
 *   B ∈ ALLOWED_DEPENDENCIES[A]. Same-layer edges are always legal."
 *   guard.ts:50            — layer violations are the HARD gate: `process.exit(1)`.
 *   guard.ts:42            — every other sentinel finding is printed and does NOT block.
 *   guard.ts:73            — a drift comparison that did not run must say NOT ASSESSED, not tick.
 *
 * Every scenario carries its counter-half, because a gate that blocks everything passes every
 * recall test ever written: 01 legal / 02 illegal, 03 same-layer legal / 02 cross-layer illegal,
 * 04 a test file exempt / 02 the identical import in shipped code blocking.
 *
 * KNOWN GAPS are run and PRINTED but do not set the exit code — see the section at the bottom.
 * They are defects in `guard`, not in the scenarios, and codifying them as expectations would turn
 * this file into a record that the bug is correct.
 *
 * WHAT IT DOES NOT TEST:
 *   - `--force`, which runs a full `analyze` pulse before checking. Every scenario here analyses
 *     the temp repo itself, so the pulse is already there and `--force` would only re-run it.
 *   - the drift THRESHOLD arithmetic (`avgRisk > threshold`). Producing a controlled velocity needs
 *     two pulses whose fingerprints differ by a known amount, which is `bench-drift`'s subject.
 *   - `no_cycles` / `rank_violations` truth. `guard` prints them and blocks on neither, so they
 *     change no outcome here; `oracle-audit.mjs` owns cycle truth.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** A leaf every scenario can point at, so no file is an isolated node. */
const CONTRACTS = { 'src/contracts/index.ts': `export interface Port { id: string }\nexport const VERSION = '1';\n` };

const SCENARIOS = [
  {
    name: '01 a legal downward dependency does not block',
    why: 'domain → core is in ALLOWED_DEPENDENCIES. If this blocks, the gate is unusable and every other scenario is measuring a broken baseline',
    files: {
      ...CONTRACTS,
      'src/lib/core/store.ts': `export function load(): number { return 1; }\n`,
      'src/lib/domain/rules.ts': `import { load } from '../core/store.js';\nexport function apply(): number { return load(); }\n`,
    },
    mustExit: 0,
    mustSay: ['Layer contract clean'],
  },
  {
    name: '02 an illegal upward dependency blocks, and names the pair',
    why: 'core → domain is the breach ADR 0005 exists to stop: the inner layer reaching outward. This is the ONE thing guard exits 1 on, so if it passes silently the command has no gate at all',
    files: {
      ...CONTRACTS,
      'src/lib/domain/rules.ts': `export function apply(): number { return 2; }\n`,
      'src/lib/core/store.ts': `import { apply } from '../domain/rules.js';\nexport function load(): number { return apply(); }\n`,
    },
    mustExit: 1,
    mustSay: ['Illegal layer dependency: core → domain', 'Blocked'],
  },
  {
    name: '03 a same-layer import is always legal',
    why: 'ALLOWED_DEPENDENCIES.contracts is EMPTY — read without the same-layer carve-out, a contracts file importing its own sibling is a breach of a rule that allows nothing. The carve-out is what stops the strictest layer blocking on itself',
    files: {
      'src/contracts/ids.ts': `export type Id = string;\nexport const EMPTY: string = '';\n`,
      'src/contracts/index.ts': `import { EMPTY } from './ids.js';\nexport function blank(): string { return EMPTY; }\n`,
    },
    mustExit: 0,
    mustSay: ['Layer contract clean'],
    mustNotSay: ['Illegal layer dependency'],
  },
  {
    name: '04 a test importing across layers is exempt',
    why: 'the counter-half of 02, and the reason layerOf checks for a test path BEFORE the fragments. A unit test imports the unit it tests — that is the definition of one — and a tree where tests/lib/core/*.test.ts imports domain would otherwise block every commit',
    files: {
      ...CONTRACTS,
      'src/lib/domain/rules.ts': `export function apply(): number { return 2; }\n`,
      'src/lib/core/store.ts': `export function load(): number { return 1; }\n`,
      'tests/lib/core/store.test.ts': `import { apply } from '../../../src/lib/domain/rules.js';\nimport { load } from '../../../src/lib/core/store.js';\nexport const t = () => apply() + load();\n`,
    },
    mustExit: 0,
    mustSay: ['Layer contract clean'],
    mustNotSay: ['Illegal layer dependency'],
  },
  {
    name: '05 a cli file may reach composition but not domain',
    why: 'the two halves of one layer row in the same tree. cli → composition is allowed; cli → domain is not, and BOTH edges exist here, so the gate has to separate them rather than judge the file',
    files: {
      ...CONTRACTS,
      'src/lib/domain/rules.ts': `export function apply(): number { return 2; }\n`,
      'src/registry/index.ts': `export function wire(): number { return 3; }\n`,
      'src/interfaces/cli/run.ts': `import { wire } from '../../registry/index.js';\nimport { apply } from '../../lib/domain/rules.js';\nexport function go(): number { return wire() + apply(); }\n`,
    },
    mustExit: 1,
    mustSay: ['Illegal layer dependency: cli → domain'],
    mustNotSay: ['cli → composition'],
  },
  {
    name: '06 one violation per illegal PAIR, not per edge',
    why: 'governance/index.ts:392 dedupes on the layer pair. Three illegal edges of the same shape must print one line — the alternative is a 400-line wall for one architectural mistake, which is the shape nobody reads',
    files: {
      ...CONTRACTS,
      'src/lib/domain/a.ts': `export function a(): number { return 1; }\n`,
      'src/lib/domain/b.ts': `export function b(): number { return 2; }\n`,
      'src/lib/domain/c.ts': `export function c(): number { return 3; }\n`,
      'src/lib/core/store.ts':
        `import { a } from '../domain/a.js';\nimport { b } from '../domain/b.js';\nimport { c } from '../domain/c.js';\n` +
        `export function load(): number { return a() + b() + c(); }\n`,
    },
    mustExit: 1,
    mustSay: ['Illegal layer dependency: core → domain'],
    mustCountOnce: 'Illegal layer dependency: core → domain',
  },
  {
    name: '07 a single pulse is NOT ASSESSED, and does not read as a pass',
    why: 'ADR 0044, enforced at guard.ts:73. With one pulse the drift comparison cannot run. It must still exit 0 — a first commit is not a regression — while refusing to print the safe-limits line, because "we could not check" and "we checked and it is fine" were the same output before this',
    files: {
      ...CONTRACTS,
      'src/lib/core/store.ts': `export function load(): number { return 1; }\n`,
    },
    mustExit: 0,
    mustSay: ['NOT ASSESSED', 'this is not a pass'],
    mustNotSay: ['Structural resonance is within safe limits'],
  },
];

/**
 * Probes that FAIL today. They run, they print, and they do not touch the exit code — the finding
 * belongs in the report, not in a green tick that says the behaviour is intended.
 */
const KNOWN_GAPS = [
  {
    name: 'G1 the hard gate is a no-op on any project that is not conducks',
    why: 'LAYER_FRAGMENTS (sentinel-rules.ts:53) is hardcoded to `/lib/core`, `/lib/domain`, `/registry`, `/interfaces/cli|tools|web`, `/contracts`. A project laid out any other way classifies NO file, so no edge is examined and guard prints "✅ Layer contract clean." over zero subjects. Measured on the real subjects by oracle-guard.mjs: scraper 0 classifiable edges, orchestrator 0, sofie 62 — and sofie only because it happens to have a directory called `registry`',
    files: {
      'app/models/user.py': 'def user():\n    return 1\n',
      'app/db/engine.py': 'from app.models.user import user\n\ndef engine():\n    return user()\n',
    },
    expectToday: out => out.includes('Layer contract clean'),
    verdict: 'guard tells a project with no layers that its layer contract is clean',
  },
  {
    name: 'G2 renaming the rule in .conducks/sentinel.yml silently disarms the gate',
    why: 'guard.ts:32 filters on `ruleId === "layer_boundaries"`, but governance/index.ts dispatches on `rule.condition`. A sentinel.yml that keeps the condition and changes the id still EVALUATES the contract — the violations are computed — and guard then files them under "Other structural findings (pre-existing, tracked)" and exits 0. The identical breach that blocks in scenario 02 ships',
    files: {
      ...CONTRACTS,
      '.conducks/sentinel.yml':
        `version: 1\nrules:\n  - id: layers\n    name: Layer contract\n    condition: layer_boundaries\n    severity: error\n    enabled: true\n`,
      'src/lib/domain/rules.ts': `export function apply(): number { return 2; }\n`,
      'src/lib/core/store.ts': `import { apply } from '../domain/rules.js';\nexport function load(): number { return apply(); }\n`,
    },
    expectToday: (out, status) => status === 0 && !out.includes('❌ Layer contract violated'),
    verdict: 'the same core → domain breach that blocks under the default rule id ships when the id is renamed',
  },
];

function build(files) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-guard-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(repo, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
    execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
  }
  execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  return repo;
}

/** `guard` has no --json; stdout, stderr and the exit code are the whole observable surface. */
function runGuard(repo) {
  try {
    const out = execFileSync('node', [CLI, 'guard'], {
      cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { out, status: 0 };
  } catch (err) {
    return { out: String(err.stdout ?? '') + String(err.stderr ?? ''), status: err.status ?? 1 };
  }
}

function runScenario(s) {
  const repo = build(s.files);
  try {
    const { out, status } = runGuard(repo);
    const failures = [];
    if (status !== s.mustExit) failures.push(`must exit ${s.mustExit}, exited ${status}`);
    for (const needle of (s.mustSay ?? [])) {
      if (!out.includes(needle)) failures.push(`must say "${needle}"`);
    }
    for (const needle of (s.mustNotSay ?? [])) {
      if (out.includes(needle)) failures.push(`must NOT say "${needle}"`);
    }
    if (s.mustCountOnce) {
      const n = out.split(s.mustCountOnce).length - 1;
      if (n !== 1) failures.push(`must print "${s.mustCountOnce}" exactly once, printed it ${n}×`);
    }
    if (failures.length) failures.push(`--- guard said ---\n${out.trim().split('\n').map(l => `      | ${l}`).join('\n')}`);
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the guard benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);

console.log(`\n--- known gaps (printed, NOT scored) ---\n`);
for (const g of KNOWN_GAPS) {
  let line;
  try {
    const repo = build(g.files);
    try {
      const { out, status } = runGuard(repo);
      line = g.expectToday(out, status)
        ? `  ⚠ ${g.name}\n      CONFIRMED TODAY: ${g.verdict}`
        : `  ℹ ${g.name}\n      no longer reproduces — the gap may have been closed; re-read the probe before deleting it`;
    } finally { rmSync(repo, { recursive: true, force: true }); }
  } catch (err) { line = `  ? ${g.name}\n      probe crashed: ${String(err.message).split('\n')[0]}`; }
  console.log(line);
}

if (passed !== SCENARIOS.length) { console.error(`\n✖ guard fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ guard blocks on every planted breach and on nothing legal.\n`);
