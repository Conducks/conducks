import { describe, it, expect } from '@jest/globals';
import { watchBranchSwitch } from '@/interfaces/cli/commands/watch.js';

/**
 * `conducks watch` invalidates on a BRANCH SWITCH, not only on a file change (ADR 0035, todo20#P1).
 *
 * A file watcher cannot see a checkout. `git checkout` only rewrites files that actually differ
 * between the two branches, so the watcher gets a handful of ordinary-looking save events — and
 * micro-pulses each of them into a graph still describing the branch that was left. Files identical
 * on both branches fire nothing at all. The vault ends up a blend of two trees with no event
 * marking the boundary.
 *
 * Driven through a fake `readBranch` rather than a real repository: the thing under test is the
 * transition detection, and a real checkout would only prove that git works.
 */
describe('watchBranchSwitch', () => {
  /** Runs the poller over a scripted sequence of branch readings and returns every switch seen. */
  const run = async (sequence: Array<string | null>): Promise<Array<[string | null, string | null]>> => {
    let i = 0;
    const seen: Array<[string | null, string | null]> = [];
    const stop = watchBranchSwitch(
      () => sequence[Math.min(i++, sequence.length - 1)],
      (from, to) => { seen.push([from, to]); },
      5,
    );
    // Generous margin: over-polling is harmless (the sequence clamps at its last value and a
    // repeated reading is not a switch), but under-polling would miss a transition and pass falsely.
    await new Promise(r => setTimeout(r, 5 * sequence.length + 250));
    stop();
    return seen;
  };

  it('fires once when the branch moves', async () => {
    expect(await run(['alpha', 'alpha', 'beta', 'beta', 'beta'])).toEqual([['alpha', 'beta']]);
  });

  it('does not fire while the branch holds still', async () => {
    expect(await run(['alpha', 'alpha', 'alpha', 'alpha'])).toEqual([]);
  });

  it('fires once per switch, not once per poll', async () => {
    // Without the transition check this reports a switch on every tick after the first move.
    expect(await run(['alpha', 'beta', 'beta', 'gamma', 'gamma', 'gamma']))
      .toEqual([['alpha', 'beta'], ['beta', 'gamma']]);
  });

  it('does not treat a detached HEAD as a switch', async () => {
    // A rebase passes through a detached HEAD and comes back. Counting the null would invalidate
    // the graph twice for one operation and, worse, report a switch that never happened.
    expect(await run(['alpha', null, null, 'alpha', 'alpha'])).toEqual([]);
  });

  it('stops polling once stopped', async () => {
    let calls = 0;
    const stop = watchBranchSwitch(() => { calls++; return 'alpha'; }, () => {}, 5);
    await new Promise(r => setTimeout(r, 30));
    stop();
    const after = calls;
    await new Promise(r => setTimeout(r, 30));
    expect(calls).toBe(after);
  });
});
