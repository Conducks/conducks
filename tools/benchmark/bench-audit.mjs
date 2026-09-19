#!/usr/bin/env node
/**
 * Conducks — the audit benchmark. Planted cycles it must fail on, and legal shapes it must not.
 *
 * `oracle-audit.mjs` scores `audit` against whatever a real subject contains, and MEASURED that two
 * of its rules have no instances in any of the three: no subject holds a single-file module cycle,
 * and adding ACCESSES to ARCH-6's traversal changes nothing anywhere. Both mutations were applied,
 * verified present in the built output, and produced no movement — so those rules are unscored by
 * the oracle by construction, and this is where they get scored.
 *
 * WHAT `audit` CLAIMS, exactly as `governance/index.ts` states it:
 *   ARCH-3 is a MODULE IMPORT cycle. It traverses module coupling only — containment is not
 *   dependency (ADR 0010), a type-only import is erased by the compiler (ADR 0016), and call-level
 *   coupling is not a module edge. A cluster of one is not a cycle, and a genuine architectural
 *   cycle spans TWO FILES: a single-file loop is an implementation detail.
 *   ARCH-6 is a mutual-call tangle. CALLS only, a cluster of one excluded, and it deliberately does
 *   NOT require two files — mutual calls inside one file are what ARCH-3 refuses to look at.
 *   ARCH-6 is a DISCOVERY and never fails the audit; ARCH-3 is a VIOLATION and does.
 *
 * NOT SCORED HERE: the printed route through a cluster and the edge named as the cut. Those are a
 * rendering and a heuristic over a membership this does check.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const SCENARIOS = [
  {
    name: '01 a two-file import cycle is an ARCH-3 violation',
    why: 'the base claim, and the one a CI job fails a build on',
    files: {
      'src/a.ts': `import { b } from './b.js';\nexport function a(): number { return b(); }\n`,
      'src/b.ts': `import { a } from './a.js';\nexport function b(): number { return a(); }\n`,
    },
    mustViolate: 'ARCH-3', mustFailAudit: true,
  },
  {
    name: '02 a single-FILE loop is not a module cycle',
    why: 'the counter-half of 01. Two functions in one file calling each other is an implementation detail, not a module-dependency smell — ARCH-6 is where that shape belongs. WHAT THIS DOES AND DOES NOT PROVE, measured: it pins the OUTCOME, and it does NOT exercise the spans-two-files filter, because two functions in one file produce CALLS edges and ARCH-3 traverses module coupling only — there is no module-edge cluster for the filter to reject. Setting the filter to `files.size >= 1` leaves this green. The filter is unexercised by this bench AND by all three subjects',
    files: {
      'src/solo.ts': `export function up(n: number): number { return n > 0 ? down(n - 1) : 0; }\nexport function down(n: number): number { return up(n - 1); }\n`,
    },
    mustNotViolate: 'ARCH-3',
  },
  {
    name: '03 mutual calls in one file ARE an ARCH-6 tangle, and never fail the audit',
    why: 'ADR 0017 split these out of ARCH-3 because a module cycle and two functions calling each other are different facts. A discovery, not a violation: mutual recursion is legal and only a human can tell it from a knot',
    files: {
      'src/solo.ts': `export function up(n: number): number { return n > 0 ? down(n - 1) : 0; }\nexport function down(n: number): number { return up(n - 1); }\n`,
    },
    mustDiscover: 'ARCH-6', mustFailAudit: false,
  },
  {
    name: '04 self-recursion is neither a cycle nor a tangle',
    why: 'a recursive function is not an architectural defect. WHAT THIS DOES AND DOES NOT PROVE, measured: `detectCycles` returns NO cluster at all for a self-loop, so the `c.length > 1` guards in both rules never receive one — loosening either to accept a singleton leaves this green. The outcome is pinned; the guards are unexercised, and they are defensive against a detector that could start returning singletons rather than against anything it does today',
    files: { 'src/rec.ts': `export function fact(n: number): number { return n <= 1 ? 1 : n * fact(n - 1); }\n` },
    mustNotViolate: 'ARCH-3', mustNotDiscover: 'ARCH-6',
  },
  {
    name: '05 a clean two-file dependency is not a cycle',
    why: 'the shape an ordinary import has. If this failed, every project would fail',
    files: {
      'src/a.ts': `import { b } from './b.js';\nexport function a(): number { return b(); }\n`,
      'src/b.ts': `export function b(): number { return 1; }\n`,
    },
    mustNotViolate: 'ARCH-3', mustFailAudit: false,
  },
  {
    name: '06 a THREE-file import cycle is one violation, not three',
    why: 'the cluster is the finding. Reporting each member separately turns one architectural fact into three tickets that are all the same ticket',
    files: {
      'src/x.ts': `import { y } from './y.js';\nexport function x(): number { return y(); }\n`,
      'src/y.ts': `import { z } from './z.js';\nexport function y(): number { return z(); }\n`,
      'src/z.ts': `import { x } from './x.js';\nexport function z(): number { return x(); }\n`,
    },
    mustViolate: 'ARCH-3', mustViolateCount: 1,
  },
  {
    name: '07 a module cycle inside ONE file is not an ARCH-3 violation',
    why: 'this is the case that REACHES the spans-two-files filter, which scenario 02 does not: two classes extending each other produce EXTENDS edges, and EXTENDS is module coupling, so a cluster genuinely forms and the filter is what rejects it. Verified reachable before the scenario was written — the vault holds `EXTENDS alpha -> beta` and `EXTENDS beta -> alpha`, both in one file, and audit reports 0 cycles',
    files: { 'src/circ.ts': `export class Alpha extends Beta { a(): number { return 1; } }\nexport class Beta extends Alpha { b(): number { return 2; } }\n` },
    mustNotViolate: 'ARCH-3', mustFailAudit: false,
  },
  {
    name: '08 the same cycle ACROSS two files is a violation',
    why: 'the counter-half of 07: the same logical shape across two files IS a violation, so the file filter is a filter and not a blanket. WHAT IT DOES NOT PROVE, measured: its cluster is carried by the two `import` statements, not by EXTENDS — making ARCH-3 ignore EXTENDS leaves this green. That EXTENDS is traversed at all is proved by 07 instead, whose only module edges ARE the two EXTENDS and which goes red the moment the file filter is loosened',
    files: {
      'src/alpha.ts': `import { Beta } from './beta.js';\nexport class Alpha extends Beta { a(): number { return 1; } }\n`,
      'src/beta.ts': `import { Alpha } from './alpha.js';\nexport class Beta extends Alpha { b(): number { return 2; } }\n`,
    },
    mustViolate: 'ARCH-3', mustFailAudit: true,
  },
];

function auditJson(repo) {
  try {
    const raw = execFileSync('node', [CLI, 'audit', '--json'], { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    return { out: JSON.parse(raw.slice(raw.indexOf('{'))), exit: 0 };
  } catch (err) {
    // `audit` exits 1 when it finds a violation — that IS the gate working, not a crash.
    if (err.stdout === undefined) throw err;
    const raw = String(err.stdout);
    return { out: JSON.parse(raw.slice(raw.indexOf('{'))), exit: err.status ?? 1 };
  }
}

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-audit-'));
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

    const { out, exit } = auditJson(repo);
    const vio = (out.violations ?? []).map(v => String(v.message ?? v));
    const disc = (out.discoveries ?? []).map(d => String(d.message ?? d));
    const failures = [];

    if (s.mustViolate && !vio.some(v => v.includes(s.mustViolate))) {
      failures.push(`must report a ${s.mustViolate} violation — got ${vio.join(' | ') || 'none'}`);
    }
    if (s.mustNotViolate && vio.some(v => v.includes(s.mustNotViolate))) {
      failures.push(`must NOT report ${s.mustNotViolate} — got ${vio.join(' | ')}`);
    }
    if (s.mustDiscover && !disc.some(d => d.includes(s.mustDiscover))) {
      failures.push(`must report a ${s.mustDiscover} discovery — got ${disc.join(' | ') || 'none'}`);
    }
    if (s.mustNotDiscover && disc.some(d => d.includes(s.mustNotDiscover))) {
      failures.push(`must NOT report ${s.mustNotDiscover} — got ${disc.join(' | ')}`);
    }
    if (s.mustViolateCount !== undefined) {
      const n = vio.filter(v => v.includes(s.mustViolate)).length;
      if (n !== s.mustViolateCount) failures.push(`expected ${s.mustViolateCount} ${s.mustViolate} violation(s), got ${n}`);
    }
    if (s.mustFailAudit !== undefined) {
      const failed = exit !== 0 || out.success === false;
      if (failed !== s.mustFailAudit) failures.push(`audit must ${s.mustFailAudit ? 'FAIL' : 'PASS'} — success=${out.success}, exit=${exit}`);
    }
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the audit benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ audit fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ audit answers every scenario as its own claims say it should.\n`);
