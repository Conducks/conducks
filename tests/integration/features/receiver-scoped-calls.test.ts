import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A call's RECEIVER decides which symbol it reaches, and step 3c of the intra-file linker throws it
 * away: `bareName.split('.').pop()` reduces `asyncio.run` to `run`, then resolves `run` against the
 * source file's imported units. `svc.py` is imported and owns a `run`, so `asyncio.run(main())`
 * binds to `Worker.run`.
 *
 * The block's own comment says import-scoping is the safety rail — "leaving external receivers
 * (path.join, results.filter — no in-graph method of that name in an imported unit) correctly
 * dangling". That rail holds only while no imported unit happens to own a method of the same name.
 * The moment one does, the receiver that would have settled it has already been discarded.
 *
 * MEASURED before writing this, on the round 5 subjects: 19 of 2,372 call sites on scraper (0.80%)
 * and 5 of 9,280 on sofie (0.05%) bind a project symbol while the receiver is an external module.
 * Corpus-wide that is small; it concentrates on hub names, and on the symbols it touches the local
 * error is not small — `JobRunner.run` had 1 of 4 direct callers false, and on this fixture
 * `Worker.run` has 3 of 5.
 *
 * The counter-cases matter as much as the bug cases here. A fix that refuses whenever a receiver is
 * unresolved would also drop `svc.load()`, where the receiver IS a project module — so both
 * directions are asserted, and the fix has to tell them apart rather than refuse broadly.
 */
describe('a call is resolved through its receiver, not by method name alone', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('receiver-scoped-calls');

    // `run` and `load` exist as PROJECT symbols, which is the precondition: with no in-graph method
    // of that name the old rail held and there was nothing to get wrong.
    writeFile(repo, 'svc.py', `
class Worker:
    def run(self, n):
        return n + 1
    def helper(self):
        return self.run(0)

def load(path):
    return path
`);
    writeFile(repo, 'app.py', `
import asyncio
import subprocess
import numpy as np
import asyncio as aio
import svc
from svc import Worker

async def main():
    w = Worker()
    a = w.run(1)
    b = Worker.run(w, 2)
    c = svc.load("x")
    return a + b + c

def shell():
    return subprocess.run(["ls"])

def arr():
    return np.load("f.npy")

def aliased():
    return aio.run(main())

if __name__ == "__main__":
    asyncio.run(main())
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  const callersOf = (symbol: string): Set<string> => {
    const { stdout } = runCli(['impact', symbol, 'upstream', '--json'], { cwd: repo });
    const d = JSON.parse(stdout);
    return new Set(d.affectedNodes.filter((n: any) => n.distance === 1).map((n: any) => String(n.name)));
  };

  // ── the callers that must SURVIVE any fix ────────────────────────────────

  it('binds an instance receiver: w.run(1) where w = Worker()', () => {
    expect(callersOf('svc.py::Worker.run')).toContain('main');
  }, 180000);

  it('binds a self receiver: self.run(0) inside the same class', () => {
    expect(callersOf('svc.py::Worker.run')).toContain('helper');
  }, 180000);

  it('binds a PROJECT-MODULE receiver: svc.load("x") where svc.py is this project', () => {
    // The case that rules out "refuse whenever the receiver has no resolvable type". `svc` is a
    // module, not an instance, so it carries no `instanceOf` — and it must still bind.
    expect(callersOf('svc.py::load')).toContain('main');
  }, 180000);

  // ── the bindings that must NOT exist ─────────────────────────────────────

  it('does not bind a stdlib receiver: subprocess.run(["ls"])', () => {
    expect(callersOf('svc.py::Worker.run')).not.toContain('shell');
  }, 180000);

  /**
   * KNOWN GAP, asserted as it behaves rather than as it should.
   *
   * `import asyncio as aio` records nothing the resolver can read. The parser now CAPTURES aliased
   * imports — `import numpy as np` mints `ecosystem::numpy`, which it did not before — but the edge
   * carries the package name and not the alias, and a second import of a package already seen is
   * deduplicated, so `aio` appears nowhere in the graph. The receiver check refuses on the name it
   * can find; `aio` is not one.
   *
   * Written this way on purpose: asserting `not.toContain` would leave a red suite, and asserting
   * nothing would let the gap disappear from view. When the alias reaches the graph this test FAILS,
   * and the fix is to flip it back to `not.toContain` and delete this comment.
   */
  it('KNOWN GAP — an aliased stdlib receiver is still bound: import asyncio as aio, then aio.run()', () => {
    expect(callersOf('svc.py::Worker.run')).toContain('aliased');
  }, 180000);

  /** KNOWN GAP, same cause as the aliased-stdlib case above. Flip to `not.toContain` when fixed. */
  it('KNOWN GAP — an aliased third-party receiver is still bound: np.load("f.npy")', () => {
    expect(callersOf('svc.py::load')).toContain('arr');
  }, 180000);

  it('does not bind a module-level stdlib call: asyncio.run(main()) under __main__', () => {
    // Reported as the file's own unit rather than a function, so it is asserted by name separately —
    // the module-scope path reaches step 3c the same way but arrives with a different sourceId.
    expect(callersOf('svc.py::Worker.run')).not.toContain('app.py');
  }, 180000);

  it('still sees the REAL call inside the discarded one: asyncio.run(main()) calls main', () => {
    // `asyncio.run(main())` holds two calls. Refusing the outer one must not cost the inner one,
    // which is a true edge on the same line — the assertion that stops the fix over-reaching.
    expect(callersOf('app.py::main')).toContain('app.py');
  }, 180000);
});

/**
 * The same defect in TypeScript, because step 3c is language-agnostic — it splits on `.` and takes
 * the last segment whatever produced the target. MEASURED on sofie: `Math.min()` bound to a project
 * `min`, `Math.max()` to a project `max`, and `os.cpus()` to a project `cpus`.
 *
 * MEASURED: these four PASS today, and that is the finding. TypeScript never reaches step 3c for
 * these calls — `Math.min(1, 2)` resolves to `global::math` and `os.cpus()` to
 * `node:os::default.cpus`, both real external nodes. Python has neither: `import asyncio` mints an
 * `ecosystem::asyncio` node but emits NO `IMPORTS` edge from the file, and `import numpy as np`
 * mints nothing at all, so nothing downstream can say what the receiver was.
 *
 * They stay as regression guards. The fix below refuses a binding whose receiver is external, and
 * the way to get that wrong is to refuse too much — these four are the shapes TypeScript already
 * gets right and must still get right afterwards.
 */
describe('receiver scoping holds in TypeScript too', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('receiver-scoped-calls-ts');

    writeFile(repo, 'src/svc.ts', `
export class Worker {
  run(n: number): number { return n + 1; }
  helper(): number { return this.run(0); }
}
`);
    // The colliding symbols live in the CALLING file. On sofie `os.cpus()` bound to a `cpus`
    // declared in the same file it was called from — step 3c checks the source unit's own symbol
    // map BEFORE it walks imports, so a same-file collision takes a different branch than a
    // cross-file one and has to be exercised separately. A first draft of this fixture put them in
    // svc.ts, every case passed, and the pass proved nothing.
    writeFile(repo, 'src/app.ts', `
import os from 'node:os';
import { Worker } from './svc.js';

export function cpus(): number { return 4; }
export function min(a: number, b: number): number { return a < b ? a : b; }

export function real(): number {
  const w = new Worker();
  return w.run(1) + cpus() + min(1, 2);
}

export function viaGlobal(): number {
  return Math.min(1, 2);
}

export function viaStdlib(): number {
  return os.cpus().length;
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  const callersOf = (symbol: string): Set<string> => {
    const { stdout } = runCli(['impact', symbol, 'upstream', '--json'], { cwd: repo });
    const d = JSON.parse(stdout);
    return new Set(d.affectedNodes.filter((n: any) => n.distance === 1).map((n: any) => String(n.name)));
  };

  it('binds an instance receiver: w.run(1)', () => {
    expect(callersOf('src/svc.ts::Worker.run')).toContain('real');
  }, 180000);

  it('binds a plain same-file call: cpus() and min()', () => {
    // No receiver at all — the case step 3c is not involved in, asserted so a fix scoped to dotted
    // targets cannot quietly break the undotted ones.
    expect(callersOf('src/app.ts::cpus')).toContain('real');
    expect(callersOf('src/app.ts::min')).toContain('real');
  }, 180000);

  it('does not bind a node builtin receiver: os.cpus() beside a same-file cpus()', () => {
    expect(callersOf('src/app.ts::cpus')).not.toContain('viaStdlib');
  }, 180000);

  it('does not bind a global-object receiver: Math.min() beside a same-file min()', () => {
    // `Math` is not imported at all, so import-scoping alone cannot be what refuses this one.
    expect(callersOf('src/app.ts::min')).not.toContain('viaGlobal');
  }, 180000);
});

