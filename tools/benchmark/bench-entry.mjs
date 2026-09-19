#!/usr/bin/env node
/**
 * Conducks — the entry benchmark. Planted ways in it must find, and near-misses it must not call one.
 *
 * `oracle-entry.mjs` scores `entry` against whatever a real subject happens to contain. This asks for
 * shapes on purpose — a bin imported only by a test, a barrel, a scratch script that is otherwise a
 * perfect root module — which no subject guarantees and which are exactly where the rule is decided.
 *
 * WHAT `entry` CLAIMS, and therefore what is scored (ADR 0113): three rules, each restricted to a
 * kind that can really be an entry, each recording WHY.
 *   route          a framework route or handler on a BEHAVIOR/INFRA node — served, not called
 *   entry-filename a UNIT whose basename is a conventional program entry
 *   root-module    a UNIT nothing imports, which imports something itself
 * with tests and scratch trees excluded, and a TEST importer NOT disqualifying a root module.
 *
 * THE GRAVITY RANKING IS NOT SCORED. Which entry point matters most is a policy, and checking a
 * policy against a second opinion compares two policies rather than finding a defect.
 *
 * Every scenario carries its counter-half in the same set: for each rule that must fire there is a
 * shape that must NOT, because a detector that flags everything passes every recall test ever written.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const SCENARIOS = [
  // ── L2: real entry points it must find ────────────────────────────────────
  {
    name: '01 a conventional program filename is an entry',
    why: 'the base claim of rule 2 — `main.py` is where a Python program starts',
    files: {
      'src/main.py': 'from lib import work\n\ndef run():\n    return work()\n',
      'src/lib.py': 'def work():\n    return 1\n',
    },
    mustFind: [['main.py', 'entry-filename']],
  },
  {
    name: '02 a server file is an entry, and the module it imports is not',
    why: 'rule 2 fires on the server; the imported module has an importer so rule 3 must not',
    files: {
      'src/server.ts': `import { handle } from './handler.js';\nexport function boot(): number { return handle(); }\n`,
      'src/handler.ts': `export function handle(): number { return 1; }\n`,
    },
    mustFind: [['server.ts', 'entry-filename']],
    mustNotFind: ['handler.ts'],
  },
  {
    name: '03 a module nothing imports, which imports something, is a root module',
    why: 'rule 3 — the shape a starting file has when its name is not conventional',
    files: {
      'src/boot.ts': `import { dep } from './dep.js';\nexport function go(): number { return dep(); }\n`,
      'src/dep.ts': `export function dep(): number { return 1; }\n`,
    },
    mustFind: [['boot.ts', 'root-module']],
    mustNotFind: ['dep.ts'],
  },
  {
    name: '04 a bin imported ONLY by a test is still an entry',
    why: 'ADR 0113 headline: counting test importers hid this repository OWN bin, the only real entry it had. `prune` asks "is this used", where a test IS a consumer; `entry` asks "is this where execution begins", where a test importer says nothing',
    files: {
      'src/bin.ts': `import { dep } from './dep.js';\nexport function main(): number { return dep(); }\n`,
      'src/dep.ts': `export function dep(): number { return 1; }\n`,
      'tests/bin.test.ts': `import { main } from '../src/bin.js';\nexport const t = () => main();\n`,
    },
    mustFind: [['bin.ts', 'root-module']],
  },

  // ── L3: near-misses it must NOT call an entry point ───────────────────────
  {
    name: '05 a barrel is not an entry, however root-like it looks',
    why: 'ADR 0113 leaves `index.ts` out of the filename set on purpose — a barrel is the commonest file in a TypeScript project and is never where execution starts. Including it flagged 25 files on this repository, none of them an entry',
    files: {
      'src/index.ts': `export { dep } from './dep.js';\n`,
      'src/dep.ts': `export function dep(): number { return 1; }\n`,
      'src/app.ts': `import { dep } from './index.js';\nexport function go(): number { return dep(); }\n`,
    },
    mustNotFindWithReason: [['index.ts', 'entry-filename']],
  },
  {
    name: '06 a test file is never an entry, even though nothing imports it',
    why: 'a test has no importers BY DESIGN, which is the exact shape rule 3 reads — so the exclusion is what stops rule 3 flagging every test in the project',
    files: {
      'src/dep.ts': `export function dep(): number { return 1; }\n`,
      'tests/thing.test.ts': `import { dep } from '../src/dep.js';\nexport const t = () => dep();\n`,
    },
    mustNotFind: ['thing.test.ts'],
  },
  {
    name: '07 a scratch script is not the way into a project',
    why: 'a one-off under scripts/ has no importers and imports something — rule 3 exactly — and is still not where the program starts',
    files: {
      'src/dep.ts': `export function dep(): number { return 1; }\n`,
      'scripts/oneoff.ts': `import { dep } from '../src/dep.js';\nexport const go = () => dep();\n`,
    },
    mustNotFind: ['oneoff.ts'],
  },
  {
    name: '08 a conventional filename inside a test tree is still not an entry',
    why: 'the counter-half of 01 — the exclusion has to beat the filename, or every fixture called main.py becomes a way into the program',
    files: {
      'src/lib.py': 'def work():\n    return 1\n',
      'tests/main.py': 'from src.lib import work\n\ndef run():\n    return work()\n',
    },
    mustNotFind: ['main.py'],
  },
  {
    name: '09 a module a real file imports is not a root module',
    why: 'the counter-half of 03. A NON-test importer does disqualify it — that is the half of the importer rule that must still bite. THE FIRST VERSION OF THIS SCENARIO WAS VACUOUS: its middle file imported nothing, so rule 3 excluded it on the imports-out half — scenario 10 claim — and the scenario passed with the importer check removed entirely. Proven by mutation, which is the only thing that could have shown it. The middle file now imports a leaf, so having a non-test importer is its ONLY disqualifier',
    files: {
      'src/boot.ts': `import { mid } from './mid.js';\nexport function go(): number { return mid(); }\n`,
      'src/mid.ts': `import { leaf } from './leaf.js';\nexport function mid(): number { return leaf(); }\n`,
      'src/leaf.ts': `export function leaf(): number { return 1; }\n`,
    },
    mustFind: [['boot.ts', 'root-module']],
    mustNotFindWithReason: [['mid.ts', 'root-module']],
  },
  {
    name: '11 a Next.js route file is an entry, reported as a route',
    why: 'rule 1 — the only rule the bench could not reach. Every other route shape needs a framework the parser recognises naming its own path; Next.js declares one by FILE POSITION, so a two-file repo is enough. `app/api/hello/route.ts` exporting GET is served, not called, and the route group `(admin)` in the second path must vanish from the URL',
    files: {
      'app/api/hello/route.ts': `export async function GET(): Promise<number> { return 1; }\n`,
      'app/(admin)/api/users/[id]/route.ts': `export async function POST(): Promise<number> { return 2; }\n`,
    },
    mustFind: [['ROUTE::/api/hello::GET', 'route'], ['ROUTE::/api/users/:id::POST', 'route']],
  },
  {
    name: '12 a lowercase handler and a page are not routes',
    why: 'the counter-half of 11. Next.js treats only an UPPERCASE export as a handler, and `page.tsx` is UI — a rule reading the directory alone would invent an endpoint for every file under app/',
    files: {
      'app/api/quiet/route.ts': `export async function get(): Promise<number> { return 1; }\n`,
      'app/dashboard/page.tsx': `export default function Page(): number { return 1; }\n`,
    },
    mustNotFind: ['ROUTE::/api/quiet::GET', 'ROUTE::/api/quiet::get', 'ROUTE::/dashboard::GET'],
  },
  {
    name: '10 a leaf that imports nothing is not a root module',
    why: 'rule 3 needs BOTH halves — no importers AND an import of its own. An isolated file has no importers either, and a rule reading only the first half would call every orphan a way in',
    files: {
      'src/alone.ts': `export function alone(): number { return 1; }\n`,
      'src/boot.ts': `import { dep } from './dep.js';\nexport function go(): number { return dep(); }\n`,
      'src/dep.ts': `export function dep(): number { return 1; }\n`,
    },
    mustNotFind: ['alone.ts'],
  },
];

function entryOf(repo) {
  const raw = execFileSync('node', [CLI, 'entry', repo, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(raw.slice(raw.indexOf('[')));
}

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-entry-'));
  try {
    for (const [rel, body] of Object.entries(s.files)) {
      const abs = path.join(repo, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
      execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
    }
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });

    const rows = entryOf(repo);
    const seen = rows.map(r => `${r.name}:${r.reason}`);
    const failures = [];

    for (const [name, reason] of (s.mustFind ?? [])) {
      const hit = rows.find(r => r.name === name);
      if (!hit) failures.push(`must report ${name} — got ${seen.join(', ') || 'nothing'}`);
      else if (hit.reason !== reason) failures.push(`${name} must be reported as ${reason}, got ${hit.reason}`);
    }
    for (const name of (s.mustNotFind ?? [])) {
      if (rows.some(r => r.name === name)) failures.push(`must NOT report ${name} — got ${seen.join(', ')}`);
    }
    for (const [name, reason] of (s.mustNotFindWithReason ?? [])) {
      const hit = rows.find(r => r.name === name && r.reason === reason);
      if (hit) failures.push(`must NOT report ${name} as ${reason}`);
    }
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the entry benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ entry fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ entry answers every scenario as its own claims say it should.\n`);
