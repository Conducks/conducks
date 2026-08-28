#!/usr/bin/env node
/**
 * Conducks — the context benchmark. Planted neighbours it must return, and non-neighbours it must not.
 *
 * `oracle-context.mjs` scores context against a radius walk of whatever a subject contains. This asks
 * for shapes on purpose — a neighbour at exactly two hops, an ATOM, a container, an island — which no
 * subject guarantees.
 *
 * WHAT CONTEXT CLAIMS, and therefore what is scored: the nodes within `radius` hops, excluding
 * containers always and ATOMs unless asked, with the anchor itself left out and both bounds reported.
 *
 * THE SCORE IS NOT SCORED. Which neighbour ranks highest is a policy; checking it against a second
 * opinion would compare two policies, not find a defect.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const CHAIN = {
  'src/d.ts': `export function four(): number { return 4; }\n`,
  'src/c.ts': `import { four } from './d.js';\nexport function three(): number { return four(); }\n`,
  'src/b.ts': `import { three } from './c.js';\nexport function two(): number { return three(); }\n`,
  'src/a.ts': `import { two } from './b.js';\nexport function one(): number { return two(); }\n`,
  'src/island.ts': `export function unrelated(): number { return 99; }\n`,
  'src/main.ts': `import { one } from './a.js';\nimport { unrelated } from './island.js';\nexport function boot(): number { return one() + unrelated(); }\n`,
};

const SCENARIOS = [
  {
    name: '01 a direct callee is a neighbour at radius 1',
    why: 'the base claim',
    files: CHAIN, from: 'src/b.ts::two', radius: 1,
    mustInclude: ['three'],
  },
  {
    name: '02 a direct caller is a neighbour at radius 1',
    why: 'context prints "called by" as well — the neighbourhood is not one-directional',
    files: CHAIN, from: 'src/b.ts::two', radius: 1,
    mustInclude: ['one'],
  },
  {
    name: '03 a two-hop neighbour is absent at radius 1 and present at radius 2',
    why: 'the counter-half. A neighbourhood that returns everything passes every inclusion assertion',
    files: CHAIN, from: 'src/b.ts::two', radius: 1,
    mustNotInclude: ['four'],
    alsoAt: { radius: 2, mustInclude: ['four'] },
  },
  {
    name: '04 a symbol on another branch is not a neighbour within the radius',
    why: 'reachable from the same ENTRY POINT but three hops from the anchor — two -> one -> boot -> unrelated. Written first at radius 3, where it genuinely IS a neighbour and the scenario was simply wrong; the claim worth making is that the radius bounds the answer, not that an unrelated name never appears at any distance',
    files: CHAIN, from: 'src/b.ts::two', radius: 2,
    mustNotInclude: ['unrelated'],
    alsoAt: { radius: 3, mustInclude: ['unrelated'] },
  },
  {
    name: '05 the anchor is not its own context',
    why: 'a neighbourhood that contains the thing you asked about wastes the budget it is spending',
    files: CHAIN, from: 'src/b.ts::two', radius: 2,
    mustNotInclude: ['two'],
  },
  {
    name: '06 a container is never returned',
    why: 'a UNIT is where a thing LIVES, not what is around it — 3,394 of them came back when the filter was mutated away',
    files: CHAIN, from: 'src/b.ts::two', radius: 2,
    mustNotIncludeKind: ['UNIT', 'DIRECTORY', 'ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE'],
  },
  {
    name: '07 both bounds are reported',
    why: 'trace shipped a depth bound that never said so (ADR 0174). This one must not',
    files: CHAIN, from: 'src/b.ts::two', radius: 2, limit: 1,
    mustReportTruncated: true,
    mustReportTotalAbove: 1,
  },
  {
    name: '08 an unbounded run says it is unbounded',
    why: 'the counter-case for 07: a flag that is always true discloses nothing',
    files: CHAIN, from: 'src/b.ts::two', radius: 1, limit: 10000,
    mustReportTruncated: false,
  },
  {
    name: '09 the same neighbourhood in Python',
    why: 'the value and import rules are written per language, and three of the four defects on 2026-08-27 were Python',
    files: {
      'src/pkg/__init__.py': ``,
      'src/pkg/deep.py': `def three():\n    return 3\n`,
      'src/pkg/mid.py': `from pkg.deep import three\n\n\ndef two():\n    return three()\n`,
      'src/pkg/top.py': `from pkg.mid import two\n\n\ndef one():\n    return two()\n`,
      'src/main.py': `from pkg.top import one\n\n\ndef boot():\n    return one()\n`,
    },
    from: 'src/pkg/mid.py::two', radius: 1,
    mustInclude: ['three', 'one'],
  },
  {
    name: '10 a cycle does not repeat a neighbour',
    why: 'mutual recursion is legal, and a neighbourhood listing a node twice spends the budget twice',
    files: {
      'src/cycle.ts': `export function ping(n: number): number { return n > 0 ? pong(n - 1) : 0; }\nexport function pong(n: number): number { return n > 0 ? ping(n - 1) : 1; }\n`,
      'src/main.ts': `import { ping } from './cycle.js';\nexport function boot(): number { return ping(3); }\n`,
    },
    from: 'src/cycle.ts::ping', radius: 3,
    mustInclude: ['pong'],
    mustNotRepeat: true,
  },
];

function ctx(repo, from, radius, limit) {
  const args = [CLI, 'context', from, '--radius', String(radius), '--limit', String(limit ?? 10000), '--json'];
  return JSON.parse(execFileSync('node', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-ctx-'));
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
    const out = ctx(repo, s.from, s.radius, s.limit);
    const names = (out.nodes ?? []).map(n => n.name);
    const kinds = (out.nodes ?? []).map(n => n.kind);

    for (const n of (s.mustInclude ?? [])) if (!names.includes(n)) failures.push(`must include ${n} — got ${names.join(',') || 'nothing'}`);
    for (const n of (s.mustNotInclude ?? [])) if (names.includes(n)) failures.push(`must NOT include ${n}`);
    for (const k of (s.mustNotIncludeKind ?? [])) if (kinds.includes(k)) failures.push(`must NOT return a ${k}`);
    if (s.mustReportTruncated !== undefined && out.truncated !== s.mustReportTruncated) {
      failures.push(`truncated must be ${s.mustReportTruncated} — got ${out.truncated}`);
    }
    if (s.mustReportTotalAbove !== undefined && !(out.total_in_radius > s.mustReportTotalAbove)) {
      failures.push(`total_in_radius must exceed ${s.mustReportTotalAbove} — got ${out.total_in_radius}`);
    }
    if (s.mustNotRepeat) {
      const ids = (out.nodes ?? []).map(n => n.id);
      if (new Set(ids).size !== ids.length) failures.push(`a node appears twice in the neighbourhood`);
    }
    if (s.alsoAt) {
      const out2 = ctx(repo, s.from, s.alsoAt.radius, s.limit);
      const names2 = (out2.nodes ?? []).map(n => n.name);
      for (const n of (s.alsoAt.mustInclude ?? [])) {
        if (!names2.includes(n)) failures.push(`at radius ${s.alsoAt.radius}, must include ${n} — got ${names2.join(',') || 'nothing'}`);
      }
    }
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the context benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { console.log(`  ✓ ${s.name}`); passed++; }
  else { console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); failedNames.push(s.name); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ context fails: ${failedNames.join('; ')}\n`); process.exit(1); }
console.log(`\n✓ context answers every scenario as its own claims say it should.\n`);
