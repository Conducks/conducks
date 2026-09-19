import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `doctor` printed `[✗]` for every failed check and exited 0 regardless — measured with no vault at
 * all, every check failing, still 0. So it could not gate CI or a git hook, and every failure marker
 * was decoration. A command shaped like a health check that cannot fail is a check nobody can act
 * on (todo77#P11).
 *
 * The `[✗]` branches were also the UNSCORED half of that phase's bench: reaching most of them means
 * removing packages from `node_modules`, so the `[✓]` side was proved and the failure side was
 * asserted by nobody. Shipping an exit code whose failure path nothing exercises would be the same
 * defect one layer up, which is why these read the source rather than claiming a run they did not do.
 *
 * What is NOT pinned here, said plainly: that each individual check sets the marker correctly. These
 * assert the wiring — a failure increments, warnings do not, and the count decides the exit — not
 * that "13 grammars available" is itself judged right. `bench-doctor.mjs` owns that half.
 */

const DOCTOR = path.resolve('src/interfaces/cli/commands/doctor.ts');
const src = () => readFileSync(DOCTOR, 'utf8');

describe('doctor exits non-zero when a check fails', () => {
  it('counts a failure when one is printed', () => {
    // The marker and the counter must be the same act, or a check can fail on screen and not in the
    // exit code — which is exactly the state this replaced.
    expect(src()).toMatch(/const fail = \(msg: string\) => \{\s*failures\+\+;/);
  });

  it('sets a non-zero exit code from that count', () => {
    const s = src();
    expect(s).toMatch(/if \(failures > 0\)/);
    expect(s).toContain('process.exitCode = 1');
  });

  /**
   * A warning is a state of the WORLD, not of this installation: "an update is available" and
   * "could not reach GitHub" must not fail a gate, or `doctor` becomes unusable offline and on any
   * machine one release behind.
   */
  it('leaves warnings out of the exit code', () => {
    const s = src();
    const warnDecl = /const warn = \(msg: string\) => [^;]*;/.exec(s);
    expect(warnDecl).not.toBeNull();
    expect(warnDecl![0]).not.toContain('failures');
  });

  it('still reports every check before deciding, rather than exiting at the first failure', () => {
    // Exiting early hid the rest of the picture from the one reader who most needed it — the same
    // reasoning `guard` records for printing its other findings before its gate.
    const s = src();
    const firstFail = s.indexOf('failures++');
    const exitPoint = s.indexOf('process.exitCode = 1');
    expect(firstFail).toBeGreaterThan(-1);
    expect(exitPoint).toBeGreaterThan(firstFail);
    expect(s.slice(0, exitPoint)).not.toContain('process.exit(');
  });
});
