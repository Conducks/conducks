#!/usr/bin/env node
/**
 * Conducks — the prune benchmark. Ten scenarios, each with a ground truth written down. 🏺
 *
 * WHY A SUITE AND NOT MORE ORACLES. The oracles score prune against a compiler on whatever a real
 * subject happens to contain, so they measure precision and recall on found material. They cannot ask
 * for a shape the subject does not have. This asks directly: build the shape, state what prune must
 * say about it, and check.
 *
 * Every scenario is a defect this repository actually shipped, or a rule it actually holds. The
 * numbers in each `why` are measured, not illustrative.
 *
 * A scenario states BOTH halves — what must be flagged and what must not — because a detector that
 * flags everything passes half of these and a detector that flags nothing passes the other half.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');
const VERDICTS = new Set(['ORPHAN', 'UNUSED_EXPORT', 'STALE_IMPORT']);

const SCENARIOS = [
  {
    name: '01 dead module-level function',
    why: 'the base claim: defined, referenced by nothing, in a file that IS imported',
    files: {
      'src/lib.ts': `export function alive(x: number): number { return x + 1; }\nfunction deadFn(x: number): number { return x + 2; }\n`,
      'src/main.ts': `import { alive } from './lib.js';\nexport function boot(): number { return alive(1); }\n`,
    },
    mustFlag: [['deadFn', 'ORPHAN']],
    mustNotFlag: ['alive'],
  },
  {
    name: '02 export consumed only by its own file',
    why: 'UNUSED_EXPORT claims "never consumed by OTHER modules" — its own file does not count',
    files: {
      'src/lib.ts': `export const LOCAL_ONLY = 7;\nexport function alive(): number { return LOCAL_ONLY; }\n`,
      'src/main.ts': `import { alive } from './lib.js';\nexport function boot(): number { return alive(); }\n`,
    },
    mustFlag: [['LOCAL_ONLY', 'UNUSED_EXPORT']],
    mustNotFlag: ['alive'],
  },
  {
    name: '03 single-binding stale import',
    why: 'the commonest stale import there is, and the one the calibration guard could never report (ADR 0163)',
    files: {
      'src/lib.ts': `export function used(): number { return 1; }\n`,
      // A SEPARATE MODULE on purpose. The retired calibration guard was keyed per (file, specifier),
      // so two statements from the SAME module merge into one record and a used sibling lifts the
      // whole thing — mutating the guard back in left this scenario passing, which made it a test
      // that proved nothing (Rule 10). From its own module, this import is the single binding the
      // guard could never report.
      'src/other.ts': `export function neverUsedHere(): number { return 2; }\n`,
      'src/user.ts': `import { used } from './lib.js';\nimport { neverUsedHere } from './other.js';\nexport function go(): number { return used(); }\n`,
      'src/main.ts': `import { go } from './user.js';\nexport function boot(): number { return go(); }\n`,
    },
    mustFlag: [['neverUsedHere', 'STALE_IMPORT']],
    mustNotFlag: ['used'],
  },
  {
    name: '04 an unused import must not launder a dead symbol',
    why: 'adding a dead import once REMOVED the finding: scraper went 23 -> 22 and the symbol vanished (ADR 0162)',
    files: {
      'src/dead.ts': `export function laundered(x: number): number { return x + 1; }\n`,
      'src/importer.ts': `import { laundered } from './dead.js';\nexport function work(x: number): number { return x * 2; }\n`,
      'src/main.ts': `import { work } from './importer.js';\nexport function boot(): number { return work(1); }\n`,
    },
    mustFlag: [['laundered', 'ONLY_IMPORTED']],
    // ONLY the ONLY_IMPORTED finding must be a question. prune also reports the import itself as
    // STALE_IMPORT, and both are true at once: the import is stale AND the symbol behind it is dead.
    mustBeQuestion: [['laundered', 'ONLY_IMPORTED']],
  },
  {
    name: '05 an unimported file is a QUESTION, not a verdict',
    why: 'disconnected and never-wired-up are the same shape to a graph; deleting the second destroys a capability (ADR 0104)',
    files: {
      'src/main.ts': `import { helper } from './helper.js';\nexport function boot(): number { return helper(); }\n`,
      'src/helper.ts': `export function helper(): number { return 1; }\n`,
      // Nothing imports this file, and the file DOES something — it wires two of its own symbols
      // together. That second half is the rule's own wording: "its file is unreachable AND the file
      // does something". A file that references nothing is judgeable, and prune says ORPHAN.
      'src/nobody-imports-me.ts': `function inner(): number { return 2; }\nexport function stranded(): number { return inner(); }\n`,
    },
    mustFlag: [['stranded', 'UNIMPORTED_MODULE']],
    mustBeQuestion: [['stranded', 'UNIMPORTED_MODULE']],
  },
  {
    name: '06 a python package barrel republishes through __all__',
    why: 'without the barrel rule this produced 11 findings on scraper, 8 of them re-exports (ADR 0162)',
    files: {
      'src/pkg/mod.py': `def via_barrel(x):\n    return x + 1\n`,
      'src/pkg/__init__.py': `from pkg.mod import via_barrel\n\n__all__ = ["via_barrel"]\n`,
      'src/main.py': `import pkg\n\n\ndef boot():\n    return pkg\n`,
    },
    // NO finding at all, not merely no verdict. ONLY_IMPORTED is a question and so is excluded from
    // VERDICTS — a verdict-only assertion here passed with the barrel rule mutated away, which makes
    // it a test that proves nothing (Rule 10).
    mustBeSilent: ['via_barrel'],
  },
  {
    name: '07 a module reached through its package, and a namespace import',
    why: 'both bound NOTHING: 8 false ORPHANs on scraper, 8 on orchestrator (ADRs 0161, 0167)',
    files: {
      'src/pkg/__init__.py': ``,
      'src/pkg/page_source.py': `def capture_dom(page):\n    return page\n`,
      'src/pkg/other.py': `def capture_dom(page):\n    return None\n`,
      'src/reader.py': `from pkg import page_source\n\n\ndef grab(page):\n    return page_source.capture_dom(page)\n`,
      'src/main.py': `from reader import grab\n\n\ndef boot(page):\n    return grab(page)\n`,
      'ts/headers.ts': `export function applyHeaders(h: string): string { return h + '!'; }\n`,
      'ts/barrel.ts': `import * as headers from './headers.js';\nexport const Manager = { wrap(h: string): string { return headers.applyHeaders(h); } };\n`,
      'ts/main.ts': `import { Manager } from './barrel.js';\nexport function boot(): string { return Manager.wrap('x'); }\n`,
    },
    // Addressed by FILE, because this scenario plants a second `capture_dom` on purpose: `other.py`
    // holds one that genuinely is dead, and a bare-name assertion cannot tell the two apart. Getting
    // that wrong read as a prune defect on the first run.
    mustNotFlag: ['pkg/page_source.py::capture_dom', 'headers.ts::applyHeaders'],
    mustFlag: [['other.py::capture_dom', 'ORPHAN']],
    // THE EDGE, not the finding. Mutating the module binding away leaves prune quiet here anyway,
    // because the intra-linker rebinds the dangling name — so a prune-only assertion proves nothing.
    // What actually broke on the subject was `impact` reporting 0 callers for a function called
    // three lines away, and that is what this asserts.
    mustHaveCaller: ['src/pkg/page_source.py::capture_dom', 'ts/headers.ts::applyHeaders'],
    // WHAT THIS SCENARIO DOES AND DOES NOT PROVE. Mutating the TS namespace capture away fails it
    // both ways — the finding and the caller. Mutating the PYTHON module binding away does not: in a
    // fixture this small the intra-linker rebinds the dangling name and the caller reappears, and
    // three attempts to defeat that (a prune assertion, an impact assertion, a same-name decoy) all
    // passed with the mechanism removed.
    //
    // So the Python half is asserted here but PROVED elsewhere: `oracle-python-dead.mjs` reports 8
    // EXTRA on the scraper subject when that binding is mutated away. Said out loud rather than left
    // to look like coverage it does not have.
  },
  {
    name: '08 every bare-value read position counts as a use',
    why: 'each was a measured false positive: 13 for a class field, 6 for a template substitution (ADRs 0165, 0166, 0167)',
    files: {
      'src/vals.ts': `export const SPREAD = ['a'] as const;\nexport const INDEXED: Record<string, number> = { ok: 1 };\nexport const TEMPLATED = 'x';\nexport const ARROWED = 'y';\nexport const FIELD = 'z';\nexport const RETURNED = 'w';\n`,
      'src/reads.ts': `import { SPREAD, INDEXED, TEMPLATED, ARROWED, FIELD, RETURNED } from './vals.js';\nexport class Holder { public readonly held = FIELD; }\nexport const arrow = () => ARROWED;\nexport function ret(): string { return RETURNED; }\nexport function all(k: string): string {\n  return \`\${TEMPLATED}\${[...SPREAD].length}\${INDEXED[k] || 0}\${arrow()}\${new Holder().held}\${ret()}\`;\n}\n`,
      'src/main.ts': `import { all } from './reads.js';\nexport function boot(): string { return all('ok'); }\n`,
      'src/py/consts.py': `KEYWORD = "d"\nALIASED = {"a"}\nTIERS = {"ok"}\n`,
      'src/py/base.py': `class Base:\n    def __init_subclass__(cls, **kw):\n        super().__init_subclass__()\n`,
      'src/py/reader.py': `from py.consts import KEYWORD, ALIASED, TIERS\nfrom py.base import Base\n\n\nclass Sub(Base, domain=KEYWORD):\n    pass\n\n\n_ALIASED = ALIASED\n\n\ndef ok(status):\n    return status in TIERS\n`,
      'src/py/main.py': `from py.reader import ok\n\n\ndef boot():\n    return ok("ok")\n`,
    },
    mustNotFlag: ['SPREAD', 'INDEXED', 'TEMPLATED', 'ARROWED', 'FIELD', 'RETURNED', 'KEYWORD', 'ALIASED', 'TIERS'],
  },
  {
    name: '09 dispatch, decorators and entry points are not dead',
    why: 'prune under-reports on purpose: a delete verdict on live code is the error it refuses',
    files: {
      'src/contract.ts': `export interface Handler { handle(x: number): number }\nexport class Impl implements Handler { handle(x: number): number { return x + 1; } }\nconst registry: Handler[] = [new Impl()];\nexport function dispatch(x: number): number { return registry.reduce((a, h) => a + h.handle(x), 0); }\n`,
      'src/main.ts': `import { dispatch } from './contract.js';\nexport function boot(): number { return dispatch(1); }\n`,
      'src/py/reg.py': `_REG = {}\n\n\ndef register(name):\n    def deco(fn):\n        _REG[name] = fn\n        return fn\n    return deco\n\n\n@register("a")\ndef handler_a(x):\n    return x\n\n\ndef run(name, x):\n    return _REG[name](x)\n`,
      'src/py/main.py': `from py.reg import run\n\n\ndef boot():\n    return run("a", 1)\n\n\nif __name__ == "__main__":\n    boot()\n`,
    },
    mustNotFlag: ['handle', 'handler_a', 'boot'],
  },
  {
    name: '10 a class member is never judged, and the limit is pinned',
    why: 'isModuleScoped excludes them deliberately — it stopped a delete verdict on NextAuth sign-in. 0 of 363 verdicts were methods, and this pins that so it cannot drift unnoticed',
    files: {
      'src/svc.ts': `export class Service {\n  public used(): number { return 1; }\n  private neverCalledAnywhere(): number { return 2; }\n}\n`,
      'src/main.ts': `import { Service } from './svc.js';\nexport function boot(): number { return new Service().used(); }\n`,
    },
    mustNotFlag: ['neverCalledAnywhere'],
    note: 'asserts the DOCUMENTED blind spot, not a capability',
  },
  {
    name: '11 a JavaScript-primary codebase',
    why: 'the coverage matrix had no JS subject at all — the three test projects hold 4, 1 and 5 .js files, which is configuration. Every JS claim rested on it sharing a parser with TS, and the two grammars genuinely differ: JS spells a class field `field_definition` where TS spells it `public_field_definition`',
    files: {
      'src/vals.mjs': `export const SPREAD = ['a'];\nexport const INDEXED = { ok: 1 };\nexport const TEMPLATED = 'x';\nexport const ARROWED = 'y';\nexport const FIELD = 'z';\nexport const RETURNED = 'w';\nexport function deadInJs() { return 0; }\n`,
      // A REAL JS CLASS FIELD — `held = FIELD`, not a constructor assignment. JavaScript spells that
      // node `field_definition` where TypeScript spells it `public_field_definition`, and ADR 0165
      // captured only the TS spelling, in the TS/TSX-only block, because putting it in the shared one
      // broke the TypeScript pack outright. So the JS half was never covered by anything.
      'src/reads.mjs': `import { SPREAD, INDEXED, TEMPLATED, ARROWED, FIELD, RETURNED } from './vals.mjs';\nexport class Holder { held = FIELD; }\nconst arrow = () => ARROWED;\nfunction ret() { return RETURNED; }\nexport function all(k) {\n  return \`\${TEMPLATED}\${[...SPREAD].length}\${INDEXED[k] || 0}\${arrow()}\${new Holder().held}\${ret()}\`;\n}\n`,
      'src/stale.mjs': `import { ret } from './reads.mjs';\nimport { deadInJs } from './vals.mjs';\nexport function go() { return ret(); }\n`,
      'src/main.mjs': `import { all } from './reads.mjs';\nimport { go } from './stale.mjs';\nexport function boot(k) { return all(k) + go(); }\n`,
    },
    mustFlag: [['deadInJs', 'STALE_IMPORT']],
    // `arrow` and `ret` are no longer exported — they were, and prune correctly called them
    // UNUSED_EXPORT, which is a true finding this scenario has no business forbidding.
    mustNotFlag: ['SPREAD', 'INDEXED', 'TEMPLATED', 'ARROWED', 'FIELD', 'RETURNED'],
  },
  {
    name: '12 a Python monorepo, cross-package',
    why: 'the matrix cell with no subject: every monorepo finding to date is TypeScript. A package that imports another package is where a shared-core layer actually lives',
    files: {
      'packages/core/__init__.py': `from core.util import shared_helper\n\n__all__ = ["shared_helper"]\n`,
      'packages/core/util.py': `def shared_helper(x):\n    return x + 1\n\n\ndef never_used_anywhere(x):\n    return x + 2\n`,
      'packages/core/config.py': `TIERS = {"ok"}\n`,
      'packages/app/__init__.py': ``,
      'packages/app/service.py': `from core.util import shared_helper\nfrom core.config import TIERS\nfrom core import util\n\n\ndef run(status, x):\n    ok = status in TIERS\n    return shared_helper(x) if ok else util.shared_helper(x)\n`,
      'packages/app/main.py': `from app.service import run\n\n\ndef boot():\n    return run("ok", 1)\n`,
    },
    mustFlag: [['never_used_anywhere', 'ORPHAN']],
    mustNotFlag: ['shared_helper', 'TIERS'],
  },
];

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-prune-'));
  try {
    for (const [rel, body] of Object.entries(s.files)) {
      const abs = path.join(repo, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'b@b'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'b'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'i'], { cwd: repo, stdio: 'ignore' });
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    const raw = execFileSync('node', [CLI, 'prune', '--json'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const findings = JSON.parse(raw);
    const failures = [];

    // A target is `symbol` or `pathFragment::symbol`. The second form exists because a scenario may
    // plant the same NAME twice deliberately, and then a bare name addresses both.
    const matches = (f, target) => {
      if (!target.includes('::')) return f.symbol === target;
      const [frag, sym] = target.split('::');
      return f.symbol === sym && String(f.file).replace(/\\/g, '/').includes(frag);
    };

    for (const [symbol, type] of (s.mustFlag ?? [])) {
      const hit = findings.filter(f => matches(f, symbol));
      if (!hit.some(f => f.type === type)) {
        failures.push(`must flag ${symbol} as ${type} — got ${hit.map(f => f.type).join(',') || 'nothing'}`);
      }
    }
    for (const [symbol, type] of (s.mustBeQuestion ?? [])) {
      const hit = findings.filter(f => matches(f, symbol) && f.type === type);
      if (!hit.length || !hit.every(f => f.claim === 'question')) {
        failures.push(`${symbol} as ${type} must be a QUESTION — got ${hit.map(f => `${f.type}/${f.claim}`).join(',') || 'nothing'}`);
      }
    }
    for (const symbol of (s.mustNotFlag ?? [])) {
      const bad = findings.filter(f => matches(f, symbol) && VERDICTS.has(f.type));
      if (bad.length) failures.push(`must NOT flag ${symbol} — got ${bad.map(f => f.type).join(',')}`);
    }
    for (const symbol of (s.mustBeSilent ?? [])) {
      const any = findings.filter(f => matches(f, symbol));
      if (any.length) failures.push(`must say NOTHING about ${symbol} — got ${any.map(f => f.type).join(',')}`);
    }
    for (const target of (s.mustHaveCaller ?? [])) {
      let callers = 0;
      try {
        const raw = execFileSync('node', [CLI, 'impact', target, 'upstream', '--json'],
          { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        callers = (JSON.parse(raw).affectedNodes ?? []).length;
      } catch { callers = 0; }
      if (callers === 0) failures.push(`${target} must have a caller — impact reports 0`);
    }
    return { failures, total: findings.length };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the prune benchmark: ${SCENARIOS.length} scenarios ---\n`);
let passed = 0;
const failedNames = [];
for (const s of SCENARIOS) {
  let res;
  try {
    res = runScenario(s);
  } catch (err) {
    res = { failures: [`scenario crashed: ${String(err.message).split('\n')[0]}`], total: 0 };
  }
  if (res.failures.length === 0) {
    console.log(`  ✓ ${s.name}`);
    passed++;
  } else {
    console.log(`  ✖ ${s.name}`);
    for (const f of res.failures) console.log(`      ${f}`);
    failedNames.push(s.name);
  }
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) {
  console.error(`\n✖ prune fails: ${failedNames.join('; ')}\n`);
  process.exit(1);
}
console.log(`\n✓ prune answers every scenario as its own claims say it should.\n`);
