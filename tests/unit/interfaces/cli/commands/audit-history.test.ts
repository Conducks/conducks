import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { AuditCommand } from '@/interfaces/cli/commands/audit.js';

/**
 * `audit --history` (state-machine audit, 2026-11-12).
 *
 * P-09-6: INSUFFICIENT_DATA printed a warning and exited 0, so a script gating on it read "no
 * verdict" as a pass — `drift` exits 1 for the same state.
 * P-09-10: a window that does not parse (`--history=abc`, `--history=0`) silently became 5. The
 * other bounded commands refuse such input rather than defaulting it.
 */
function registry(status: string) {
  const calls: number[] = [];
  return {
    calls,
    reg: {
      evolution: {
        audit: async (w: number) => { calls.push(w); return { status, message: 'Need more pulses', window_size: w, hotspots: [] }; },
      },
    } as any,
  };
}

describe('audit --history', () => {
  afterEach(() => { jest.restoreAllMocks(); process.exitCode = undefined; });
  const quiet = () => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); };

  it('exits non-zero when there is not enough history for a verdict', async () => {
    quiet();
    const { reg } = registry('INSUFFICIENT_DATA');
    await new AuditCommand().execute(['--history=5'], reg);
    expect(process.exitCode).toBe(1);
  });

  it('refuses a window that does not parse, instead of auditing 5 pulses', async () => {
    quiet();
    for (const bad of ['--history=abc', '--history=0', '--history=-2']) {
      process.exitCode = undefined;
      const { reg, calls } = registry('STABLE');
      await new AuditCommand().execute([bad], reg);
      expect([bad, calls, process.exitCode]).toEqual([bad, [], 1]);
    }
  });

  it('still defaults a bare --history to 5', async () => {
    quiet();
    const { reg, calls } = registry('STABLE');
    await new AuditCommand().execute(['--history'], reg);
    expect(calls).toEqual([5]);
    expect(process.exitCode).toBeUndefined();
  });
});
