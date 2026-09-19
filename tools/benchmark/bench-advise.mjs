#!/usr/bin/env node
/**
 * Conducks — the advise benchmark. Hubs it must name, and the look-alikes it must not.
 *
 * `oracle-advise.mjs` scores `advise` against whatever a real project happens to contain, and every
 * subject came back EXACT — which proves the ladder is implemented as written, not that the ladder
 * fires. This plants each rung on purpose, in a tree that contains the RIGHT answer and the
 * look-alike side by side.
 *
 * PAIRED BY CONSTRUCTION, and that is the whole design of this file. Every scenario puts the
 * positive and its counter-half in ONE repository with IDENTICAL fan-in, so the assertion is
 * relative: "this was reported and that was not". `hubThreshold = max(medianDegree * 5, 10)`
 * (advisor.ts:44) is derived from the graph, so a fixed count would be a scenario that silently
 * stops meaning what it says as soon as the median moves. A pair cancels the threshold out.
 *
 * WHAT `advise` CLAIMS, and therefore what is scored:
 *   advise.ts:33   — `checked` is the DENOMINATOR, read before any advice is computed. `--json`
 *                    returns `{status, checked, found}` and never a bare array, because an empty
 *                    array cannot separate "examined thousands, found nothing" from "examined
 *                    nothing" (ADR 0124).
 *   advise.ts:36   — an empty vault short-circuits to a STATED answer, not a walk that crashes and
 *                    not a green tick.
 *   advisor.ts:46  — a CONTAINER is not a monolithic hub. Every file depends on the repository.
 *   advisor.ts:63  — you cannot split a built-in or a package namespace.
 *   advisor.ts:70  — only a BEHAVIOR or a STRUCTURE has halves.
 *   advisor.ts:77  — an interface is kinded STRUCTURE and is still not splittable.
 *   advisor.ts:90  — a `@dataclass` or an `Enum` subclass is a type wearing a class keyword.
 *   advisor.ts:130 — DISTINCT CALLER FILES, cross-file only. Same-file references are not coupling.
 *
 * WHAT IT DOES NOT TEST:
 *   - CIRCULAR. `oracle-audit.mjs` owns cycle truth; planting a cycle here would score the cycle
 *     detector through a second command.
 *   - the composite RISK score, SplitScore, INTUITION, HIDDEN_COUPLING and unpinned dependencies.
 *     All five are weighted policies with hand-picked constants; checking a policy against a second
 *     opinion compares two policies. Scenario 05 scores only that their SHAPE survives `--json`.
 *   - the exact hub THRESHOLD. See the paired-by-construction note above: it is cancelled, not read.
 *   - the text renderer. Only `--json` is parsed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/** Enough distinct caller FILES to clear `max(medianDegree * 5, 10)` with room to spare. */
const FANIN = 26;
const fanFiles = (make) => Object.fromEntries(
  Array.from({ length: FANIN }, (_, i) => make(i))
);

const SCENARIOS = [
  {
    name: '01 a behavioural class is a hub; an interface with the same fan-in is not',
    why: 'the sofie subject reported `ToolDefinition` (62 files) and `Message` (25) as monolithic hubs — both interfaces, both shared on purpose, and "consider splitting" is not advice a reader can act on. A class in the identical position stays reportable, which is why the pair has to sit in one repo: it separates "excluded interfaces" from "stopped reporting anything"',
    files: {
      'src/engine.ts': `export class Engine {\n  run(): number { return 1; }\n}\n`,
      'src/shape.ts': `export interface Shape { id: string }\n`,
      ...fanFiles(i => [`src/c${i}.ts`, `import { Engine } from './engine.js';\nimport type { Shape } from './shape.js';\nexport function c${i}(s: Shape): number { return new Engine().run() + s.id.length; }\n`]),
    },
    mustReportHub: ['::engine'],
    mustNotReportHub: ['::shape'],
  },
  {
    name: '02 a Python class is a hub; a @dataclass and an Enum subclass with the same fan-in are not',
    why: 'Python has no `interface`, so a dataclass, a NamedTuple and an `Enum` subclass are all kinded `struct` alongside real behavioural classes — the keyword test in scenario 01 cannot see them. MEASURED on the scraper subject: `JobConfig` (21 files), `ExtractionResult` (12), `LevelOutputType` (11), `FeatureSet` (11) — three @dataclass containers and one str-Enum. `Machine` here is the control that must survive the exclusion',
    files: {
      'src/machine.py': 'class Machine:\n    def run(self):\n        return 1\n',
      'src/config.py': 'from dataclasses import dataclass\n\n@dataclass\nclass JobConfig:\n    name: str = ""\n',
      'src/level.py': 'from enum import Enum\n\nclass LevelOutputType(str, Enum):\n    LOW = "low"\n',
      ...fanFiles(i => [`src/c${i}.py`, `from src.machine import Machine\nfrom src.config import JobConfig\nfrom src.level import LevelOutputType\n\n\ndef c${i}():\n    return Machine().run(), JobConfig(), LevelOutputType.LOW\n`]),
    },
    mustReportHub: ['::machine'],
    mustNotReportHub: ['::jobconfig', '::leveloutputtype'],
  },
  {
    name: '03 containers and built-ins are never hubs, however much depends on them',
    why: 'advise reported `repository::conducks` ("22 distinct files depend on this symbol") and a `docs` DIRECTORY as its two loudest findings (ADR 0115), and `global::str`, `global::os`, `global::sys` on the scraper. There is no "split this" behind either: every file in a repository depends on the repository, and there is no source here to divide for a built-in. This asserts on the SHAPE of the id, so it bites whatever the container happens to be called',
    files: {
      'src/engine.py': 'class Engine:\n    def run(self):\n        return 1\n',
      ...fanFiles(i => [`src/c${i}.py`, `import os\nimport sys\n\nfrom src.engine import Engine\n\n\ndef c${i}():\n    return str(os.getcwd()) + str(sys.platform) + str(Engine().run())\n`]),
    },
    mustReportHub: ['::engine'],
    hubIdsMustNotMatch: [/^global::/, /^repository::/, /^directory::/, /^ecosystem::/, /^external:\/\//, /::unit$/],
  },
  {
    name: '04 same-file references are not coupling; cross-file ones are',
    why: 'advisor.ts:130 counts DISTINCT CALLER FILES and skips the defining file. A helper called thirty times inside its own module is a module doing its job, not a monolith — and a rule counting raw fan-in would report it while a reader could do nothing about it. `spread` is the control: identical call count, spread over files, and it must still be reported',
    files: {
      'src/local.py': 'def only():\n    return 1\n\n\n' +
        Array.from({ length: 30 }, (_, i) => `def use${i}():\n    return only()\n`).join('\n\n'),
      'src/spread.py': 'def spread():\n    return 2\n',
      ...fanFiles(i => [`src/c${i}.py`, `from src.spread import spread\n\n\ndef c${i}():\n    return spread()\n`]),
    },
    mustReportHub: ['::spread'],
    mustNotReportHub: ['::only'],
  },
  {
    name: '05 --json carries a denominator, not a bare array',
    why: 'ADR 0124, the reason advise was the FIRST surface migrated to Verdict. It printed "✅ Structural Integrity is Pristine. No sins detected." with no denominator anywhere, so "we examined 5,294 symbols and found nothing" and "we examined nothing" rendered as the same tick — this repository has hit that shape nine times. A machine reader acting on a bare `[]` cannot tell them apart either',
    files: {
      'src/a.py': 'def a():\n    return 1\n',
      'src/b.py': 'from src.a import a\n\n\ndef b():\n    return a()\n',
    },
    checkJson: (j, fail) => {
      if (!('checked' in j)) fail('--json must carry `checked`');
      if (!('status' in j)) fail('--json must carry `status`');
      if (!('found' in j)) fail('--json must carry `found`');
      if (!(Number(j.checked) > 0)) fail(`\`checked\` must be a real denominator, got ${j.checked}`);
      if (!['clean', 'findings', 'nothing'].includes(String(j.status))) fail(`unknown status "${j.status}"`);
      if (String(j.status) === 'clean' && (j.found ?? []).length > 0) fail('status "clean" with findings');
      if (String(j.status) === 'findings' && (j.found ?? []).length === 0) fail('status "findings" with none');
      for (const a of (j.found ?? [])) {
        if (!a.level || !a.type || !a.message || !Array.isArray(a.nodes)) {
          fail(`a finding is missing level/type/message/nodes: ${JSON.stringify(a).slice(0, 120)}`);
        }
      }
    },
  },
];

function hubIds(json) {
  return (json.found ?? [])
    .filter(a => a.type === 'HUB' && String(a.message).startsWith('Monolithic Hub'))
    .flatMap(a => a.nodes.map(String));
}

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-advise-'));
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

    const raw = execFileSync('node', [CLI, 'advise', '--json'], {
      cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    const json = JSON.parse(raw.slice(raw.indexOf('{')));
    const hubs = hubIds(json);
    const failures = [];
    const fail = (m) => failures.push(m);

    for (const suffix of (s.mustReportHub ?? [])) {
      if (!hubs.some(id => id.endsWith(suffix))) {
        fail(`must report a Monolithic Hub ending "${suffix}" — reported ${hubs.length ? hubs.join(', ') : 'nothing'}`);
      }
    }
    for (const suffix of (s.mustNotReportHub ?? [])) {
      const hit = hubs.filter(id => id.endsWith(suffix));
      if (hit.length) fail(`must NOT report "${suffix}" as a hub — reported ${hit.join(', ')}`);
    }
    for (const re of (s.hubIdsMustNotMatch ?? [])) {
      const hit = hubs.filter(id => re.test(id));
      if (hit.length) fail(`no hub id may match ${re} — reported ${hit.join(', ')}`);
    }
    s.checkJson?.(json, fail);
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the advise benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ advise fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ advise names every planted hub and none of the look-alikes.\n`);
