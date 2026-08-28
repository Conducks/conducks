#!/usr/bin/env node
/**
 * Conducks — the trace benchmark. Planted paths it must walk, and paths it must not invent. 🏺
 *
 * `oracle-trace.mjs` scores trace against an independent walk of whatever a subject contains. This
 * asks for shapes on purpose — a chain of a known depth, a symbol that must NOT be reachable, a
 * cycle, a bound that must disclose itself — which no subject guarantees.
 *
 * WHAT TRACE CLAIMS, and therefore what is scored:
 *   reachability — the ids reachable downstream, EXCEPT those reached only through containment
 *                  ("a step entered through MEMBER_OF is location, not dependency").
 *   path         — the shortest STRUCTURAL path between two symbols. Structural includes containment
 *                  and imports, so a path through a file node is a real answer, not a defect.
 *   bounds       — `truncated` says the PRINT stopped; `depthBounded` says the WALK stopped. Two
 *                  different facts, and ADR 0174 exists because the second was never reported.
 *
 * Order is NOT scored. trace returns nearest-first by weighted distance and disclaims execution
 * order outright (ADR 0066); asserting on it would score a claim it refuses to make.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const SCENARIOS = [
  {
    name: '01 a call chain is walked to its end',
    why: 'the base claim. ADR 0091 was written because a four-deep chain reported three links and looked complete',
    files: {
      'src/d.ts': `export function four(): number { return 4; }\n`,
      'src/c.ts': `import { four } from './d.js';\nexport function three(): number { return four(); }\n`,
      'src/b.ts': `import { three } from './c.js';\nexport function two(): number { return three(); }\n`,
      'src/a.ts': `import { two } from './b.js';\nexport function one(): number { return two(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    mustReach: ['two', 'three', 'four'],
  },
  {
    name: '02 an unrelated symbol is not reachable',
    why: 'the counter-half. A walk that returns everything passes every reachability assertion',
    files: {
      'src/used.ts': `export function reached(): number { return 1; }\n`,
      'src/island.ts': `export function unrelated(): number { return 2; }\n`,
      'src/a.ts': `import { reached } from './used.js';\nexport function one(): number { return reached(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nimport { unrelated } from './island.js';\nexport function boot(): number { return one() + unrelated(); }\n`,
    },
    from: 'src/a.ts::one',
    mustReach: ['reached'],
    mustNotReach: ['unrelated'],
  },
  {
    name: '03 a symbol reached only through containment is excluded',
    why: 'trace\'s own rule: containment may carry a walk, it is never itself the answer (todo38#P2)',
    files: {
      'src/svc.ts': `export class Service {\n  public alpha(): number { return 1; }\n  public beta(): number { return 2; }\n}\n`,
      // The idiomatic form — a named instance, then a call on it. `new Service().alpha()` chains
      // construction and call in one expression and does not bind; that is a separate shape from the
      // one this scenario is about, so it is not smuggled in here.
      'src/a.ts': `import { Service } from './svc.js';\nconst svc = new Service();\nexport function one(): number { return svc.alpha(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    // BOTH halves. `alpha` is called and must be reached; `beta` is only a member of a reached class
    // and must not be. Asserting only that Service is reached passed with the exclusion mutated
    // away, which made it a scenario that proved nothing (Rule 10).
    mustReach: ['Service', 'alpha'],
    mustNotReach: ['beta'],
  },
  {
    name: '04 a call is not hidden by a cheaper containment route',
    why: 'dijkstra keeps ONE route per node, so a symbol whose cheapest path arrived through containment was dropped even when something called it outright — paths.py::resolve_project_path was absent (ADR 0174)',
    files: {
      'src/holder.ts': `export function targetFn(): number { return 9; }\nexport function sibling(): number { return targetFn(); }\n`,
      'src/a.ts': `import { targetFn, sibling } from './holder.js';\nexport function one(): number { return targetFn() + sibling(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    mustReach: ['targetFn', 'sibling'],
  },
  {
    name: '05 the WALK bound reports itself',
    why: 'trace returned 2,057 of 2,397 reachable nodes on scraper and said truncated:false. ADR 0091 refused exactly this for the print bound; the walk bound had never been held to it (ADR 0174)',
    files: {
      'src/e.ts': `export function five(): number { return 5; }\n`,
      'src/d.ts': `import { five } from './e.js';\nexport function four(): number { return five(); }\n`,
      'src/c.ts': `import { four } from './d.js';\nexport function three(): number { return four(); }\n`,
      'src/b.ts': `import { three } from './c.js';\nexport function two(): number { return three(); }\n`,
      'src/a.ts': `import { two } from './b.js';\nexport function one(): number { return two(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    depth: 1,
    mustReportDepthBounded: true,
  },
  {
    name: '06 an unbounded walk says so',
    why: 'the counter-case for 05: a flag that is always true discloses nothing',
    files: {
      'src/b.ts': `export function two(): number { return 2; }\n`,
      'src/a.ts': `import { two } from './b.js';\nexport function one(): number { return two(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    depth: 99,
    mustReportDepthBounded: false,
  },
  {
    name: '07 the PRINT bound is a different fact from the walk bound',
    why: 'raising --limit shows more of THIS answer; raising --depth asks a bigger question. Reporting one number for both is what made a bounded answer look complete',
    files: {
      'src/wide.ts': `export function w1(): number { return 1; }\nexport function w2(): number { return 2; }\nexport function w3(): number { return 3; }\nexport function w4(): number { return 4; }\n`,
      'src/a.ts': `import { w1, w2, w3, w4 } from './wide.js';\nexport function one(): number { return w1() + w2() + w3() + w4(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    limit: 2,
    depth: 99,
    mustReportTruncated: true,
    mustReportDepthBounded: false,
  },
  {
    name: '08 a path between two symbols is a real chain',
    why: 'path mode answers a different question from reachability, and every consecutive pair must be joined by an edge that exists',
    files: {
      'src/c.ts': `export function three(): number { return 3; }\n`,
      'src/b.ts': `import { three } from './c.js';\nexport function two(): number { return three(); }\n`,
      'src/a.ts': `import { two } from './b.js';\nexport function one(): number { return two(); }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    from: 'src/a.ts::one',
    pathTo: 'src/c.ts::three',
    mustFindPath: true,
  },
  {
    name: '09 a cycle terminates and does not repeat a node',
    why: 'mutual recursion is legal, and a walk that revisits is a walk that never stops',
    files: {
      'src/cycle.ts': `export function ping(n: number): number { return n > 0 ? pong(n - 1) : 0; }\nexport function pong(n: number): number { return n > 0 ? ping(n - 1) : 1; }\n`,
      'src/main.ts': `import { ping } from './cycle.js';\nexport function boot(): number { return ping(3); }\n`,
    },
    from: 'src/cycle.ts::ping',
    mustReach: ['pong'],
    mustNotRepeat: true,
  },
  {
    name: '10 the same walk in Python',
    why: 'the value and import rules are written per language, and three of the four defects on 2026-08-27 were Python',
    files: {
      'src/pkg/__init__.py': ``,
      'src/pkg/deep.py': `def three():\n    return 3\n`,
      'src/pkg/mid.py': `from pkg.deep import three\n\n\ndef two():\n    return three()\n`,
      'src/pkg/top.py': `from pkg.mid import two\n\n\ndef one():\n    return two()\n`,
      'src/main.py': `from pkg.top import one\n\n\ndef boot():\n    return one()\n`,
    },
    from: 'src/pkg/top.py::one',
    mustReach: ['two', 'three'],
  },
];

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-trace-'));
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

    const failures = [];
    const args = [CLI, 'trace', s.from, '--json', '--limit', String(s.limit ?? 5000)];
    if (s.depth) args.push('--depth', String(s.depth));
    const out = JSON.parse(execFileSync('node', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const names = out.steps.map(x => x.name);

    for (const n of (s.mustReach ?? [])) if (!names.includes(n)) failures.push(`must reach ${n} — not in ${out.steps.length} steps`);
    for (const n of (s.mustNotReach ?? [])) if (names.includes(n)) failures.push(`must NOT reach ${n}`);
    if (s.mustReportDepthBounded !== undefined && out.depthBounded !== s.mustReportDepthBounded) {
      failures.push(`depthBounded must be ${s.mustReportDepthBounded} — got ${out.depthBounded}`);
    }
    if (s.mustReportTruncated !== undefined && out.truncated !== s.mustReportTruncated) {
      failures.push(`truncated must be ${s.mustReportTruncated} — got ${out.truncated}`);
    }
    if (s.mustNotRepeat) {
      const ids = out.steps.map(x => x.id);
      if (new Set(ids).size !== ids.length) failures.push(`a node is repeated in the walk`);
    }
    if (s.pathTo) {
      const praw = execFileSync('node', [CLI, 'trace', s.from, '--mode', 'path', '--target', s.pathTo],
        { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const hops = praw.split('\n').filter(l => /^\s+\d+\./.test(l)).length;
      if (s.mustFindPath && hops < 2) failures.push(`must find a path of at least 2 hops — got ${hops}`);
    }
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the trace benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { console.log(`  ✓ ${s.name}`); passed++; }
  else { console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); failedNames.push(s.name); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ trace fails: ${failedNames.join('; ')}\n`); process.exit(1); }
console.log(`\n✓ trace answers every scenario as its own claims say it should.\n`);
