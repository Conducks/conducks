#!/usr/bin/env node
/**
 * Conducks — the flows benchmark. Planted processes it must name, and shapes it must not call one.
 *
 * `oracle-flows.mjs` scores `flows` against whatever a real subject contains. This asks for shapes on
 * purpose — a symbol reached only over HTTP, a member reached by ACCESSES rather than CALLS, a flow
 * whose bulk is built-ins — which no subject guarantees and which are where the rule is decided.
 *
 * WHAT `flows` CLAIMS, and therefore what is scored (`flow-engine.ts::groupProcesses` + the CLI):
 *   an ENTRY is a STRUCTURE / BEHAVIOR / ATOM with a file and a non-file-shaped name, having either
 *   no incoming CALLS or only low-confidence ones (a cross-service HTTP caller is not a local caller);
 *   its MEMBERS are the transitive closure over CALLS and ACCESSES, the entry included, counting only
 *   targets that exist as nodes; and `--min-members` counts THIS PROJECT's symbols, never built-ins.
 *
 * THE PRINTED ORDER IS NOT SCORED — a rendering choice, not a claim.
 *
 * The name-collision half of ADR 0191 is pinned in `tests/unit/domain/kinetic/flow-engine.test.ts`
 * rather than here: it needs two entries sharing a name, which a graph fixture states in three lines
 * and a real repository only produces by accident.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const SCENARIOS = [
  {
    name: '01 a call chain is one flow named after its head',
    why: 'the base claim — a process is an entry plus everything it reaches',
    files: {
      'src/a.ts': `import { b } from './b.js';\nexport function head(): number { return b(); }\n`,
      'src/b.ts': `import { c } from './c.js';\nexport function b(): number { return c(); }\n`,
      'src/c.ts': `export function c(): number { return 1; }\n`,
    },
    mustHaveFlow: ['head', 3],
  },
  {
    name: '02 a symbol something else calls is not its own flow',
    why: 'the counter-half of 01. If every called symbol were also an entry, "what does this system do" would list every function in it. THIS SCENARIO WAS RED WHEN WRITTEN and is what found ADR 0191: the entry rule admitted a node when every incoming CALLS edge had confidence below 1, and no CALLS edge is ever emitted at 1, so the exception swallowed the rule it was an exception to',
    files: {
      'src/a.ts': `import { b } from './b.js';\nexport function head(): number { return b(); }\n`,
      'src/b.ts': `import { c } from './c.js';\nexport function b(): number { return c(); }\n`,
      'src/c.ts': `export function c(): number { return 1; }\n`,
    },
    mustNotHaveFlow: ['b'],
  },
  {
    name: '03 a member reached only by ACCESSES is still in the flow',
    why: 'the closure follows ACCESSES as well as CALLS — reading a value is part of what a process does, and a CALLS-only walk loses it silently',
    files: {
      'src/a.ts': `import { CONFIG } from './cfg.js';\nexport function head(): number { return CONFIG.n; }\n`,
      'src/cfg.ts': `export const CONFIG = { n: 1 };\n`,
    },
    mustHaveFlowAtLeast: ['head', 2],
  },
  {
    name: '04 a lone symbol is not a flow, and the floor says how many were hidden',
    why: 'ADR 0115 — a flow of one is not a process, and hiding it silently made "no flows" and "all flows are single" identical. The count is stated instead',
    files: { 'src/only.ts': `export function only(): number { return 1; }\n` },
    mustReportNoFlows: true,
    mustReportHiddenAbove: 0,
  },
  {
    name: '05 built-in members do not count toward the floor',
    why: 'MEASURED on sofie: 2,071 of 23,042 members were synthesised, and --min-members filtered on the inflated total — so a flow of five built-ins passed a filter whose whole purpose is removing noise',
    files: { 'src/uses.ts': `export function head(): string { return JSON.stringify(Object.keys({ a: 1 })); }\n` },
    mustNotHaveFlow: ['head'],
  },
  {
    name: '06 --min-members is honoured, and refuses a value it cannot read',
    why: 'the CLI hard-coded a floor of 2 and no cap, so "flows with at least five members" was answerable from the MCP surface only (todo61). Both surfaces take it now, and a bad value errors rather than defaulting',
    files: {
      'src/a.ts': `import { b } from './b.js';\nexport function head(): number { return b(); }\n`,
      'src/b.ts': `import { c } from './c.js';\nexport function b(): number { return c(); }\n`,
      'src/c.ts': `export function c(): number { return 1; }\n`,
    },
    mustHaveFlowAtFloor: ['head', 3],
    mustVanishAtFloor: ['head', 99],
    mustRefuseFloor: 'zero',
  },
  {
    name: '07 --json carries the denominator, not a bare list',
    why: 'ADR 0115/0145 — `[]` meant both "no flows" and "four flows, none matched". The rendered path always said which; the machine surface did not',
    files: { 'src/only.ts': `export function only(): number { return 1; }\n` },
    mustCarryCounts: true,
  },
];

const flowsJson = (repo, extra = []) => {
  const raw = execFileSync('node', [CLI, 'flows', '--json', ...extra], { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return JSON.parse(raw.slice(raw.indexOf('{')));
};

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-flows-'));
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

    const out = flowsJson(repo);
    const byName = new Map((out.flows ?? []).map(f => [String(f.name), f]));
    const failures = [];

    if (s.mustHaveFlow) {
      const [n, size] = s.mustHaveFlow;
      const f = byName.get(n);
      if (!f) failures.push(`must name a flow "${n}" — got ${[...byName.keys()].join(', ') || 'none'}`);
      else if (f.project_members !== size) failures.push(`"${n}" must have ${size} project members, got ${f.project_members}`);
    }
    if (s.mustHaveFlowAtLeast) {
      const [n, size] = s.mustHaveFlowAtLeast;
      const f = byName.get(n);
      if (!f) failures.push(`must name a flow "${n}" — got ${[...byName.keys()].join(', ') || 'none'}`);
      else if (f.project_members < size) failures.push(`"${n}" must have at least ${size} project members, got ${f.project_members}`);
    }
    for (const n of [s.mustNotHaveFlow].flat().filter(Boolean)) {
      if (byName.has(n)) failures.push(`must NOT name a flow "${n}"`);
    }
    if (s.mustReportNoFlows && (out.flows ?? []).length !== 0) {
      failures.push(`must report no flows — got ${(out.flows ?? []).length}`);
    }
    if (s.mustReportHiddenAbove !== undefined && !(out.total > s.mustReportHiddenAbove)) {
      failures.push(`must state a total above ${s.mustReportHiddenAbove} — got ${out.total}`);
    }
    if (s.mustCarryCounts) {
      for (const k of ['total', 'matching', 'shown']) {
        if (typeof out[k] !== 'number') failures.push(`--json must carry a numeric "${k}"`);
      }
    }
    if (s.mustHaveFlowAtFloor) {
      const [n, floor] = s.mustHaveFlowAtFloor;
      const o = flowsJson(repo, ['--min-members', String(floor)]);
      if (!(o.flows ?? []).some(f => f.name === n)) failures.push(`at floor ${floor}, "${n}" must still be reported`);
    }
    if (s.mustVanishAtFloor) {
      const [n, floor] = s.mustVanishAtFloor;
      const o = flowsJson(repo, ['--min-members', String(floor)]);
      if ((o.flows ?? []).some(f => f.name === n)) failures.push(`at floor ${floor}, "${n}" must NOT be reported`);
      if (!(o.total > 0)) failures.push(`at floor ${floor}, the total must still be stated — got ${o.total}`);
    }
    if (s.mustRefuseFloor) {
      let refused = false;
      try { execFileSync('node', [CLI, 'flows', '--min-members', s.mustRefuseFloor], { cwd: repo, stdio: 'pipe' }); }
      catch { refused = true; }
      if (!refused) failures.push(`--min-members "${s.mustRefuseFloor}" must be refused, not defaulted`);
    }
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the flows benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; let known = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) {
    passed++;
    console.log(`  ${s.knownDefect ? '⚠' : '✓'} ${s.name}${s.knownDefect ? '  — expected to fail and did NOT: the defect may be fixed, re-read ' + s.knownDefect : ''}`);
    if (s.knownDefect) failedNames.push(s.name.slice(0, 2));
  } else if (s.knownDefect) {
    known++;
    console.log(`  ! ${s.name}`);
    for (const f of failures) console.log(`      ${f}`);
    console.log(`      KNOWN, OPEN: ${s.knownDefect}`);
  } else {
    failedNames.push(s.name.slice(0, 2));
    console.log(`  ✖ ${s.name}`);
    for (const f of failures) console.log(`      ${f}`);
  }
}
const scored = SCENARIOS.filter(s => !s.knownDefect).length;
console.log(`\n  ${passed} of ${scored} scored scenarios pass, ${known} known open defect(s) not counted.`);
if (passed !== scored || failedNames.length) { console.error(`\n✖ flows fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ flows answers every scored scenario as its own claims say it should. ${known} defect(s) stay visible above.\n`);
