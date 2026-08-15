import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DocsWatcher, type DocsPulse } from '@/lib/domain/analysis/docs-watcher.js';

// The gate only ran when someone typed `docs-lint`, so a broken link survived until review. This
// closes that window — and must do it without ever throwing at the author mid-save.

/**
 * The cap is raised so the bounds these tests DECLARE are reachable. It is not a flake fix.
 *
 * These tests drive a REAL filesystem watcher and each carries a bound of its own: `nextPulse`
 * rejects after 3s, and the debounce case waits on a CONDITION with a 15s deadline plus a settle.
 * Jest's default per-test cap is 5s, so the 15s deadline could never be reached — whoever hardened
 * the waits (todo60) left the cap at the default, and a test whose declared bound cannot fire is
 * lying about what it measures. Raising it fixes THAT, and only that.
 *
 * MEASURED, ORDER-BALANCED, and it refutes the obvious hope: under six processes each writing 200
 * files in a loop, alternating runs gave **2/6 failures with this line and 2/6 without it**. The
 * dominant failure is the watcher receiving no OS event at all within 15s, which no timeout value
 * changes. Two earlier readings that looked decisive (3/6-vs-0/6, then 2/5-vs-4/5) were artifacts —
 * one of run order, one of comparing the file against itself because the change was already
 * committed and `git stash` had nothing to take.
 *
 * So: the flake is NOT fixed, and nobody should read this line as having fixed it. If it recurs,
 * a larger number is the one move known not to work. The real answer is to stop depending on OS
 * event delivery inside a unit test — drive the watcher's handler directly and test the debounce
 * logic, leaving one integration test for the wiring.
 */
jest.setTimeout(30_000);

describe('docs-watcher — re-lints on write, reports only', () => {
  let watcher: DocsWatcher | null = null;
  let root = '';

  afterEach(async () => {
    await watcher?.stop();
    watcher = null;
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const setup = () => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-watch-'));
    mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
    return (name: string, body: string) => writeFileSync(path.join(root, 'docs', 'decisions', name), body);
  };

  const adr = (id: string, extra = '') =>
    `# ${id} — x\nStatus: Accepted\n${extra}- Date: 2026-07-26\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n`;

  // Wait for the initial scan before acting: a write that lands during the scan is a scan leftover,
  // not the event under test.
  const nextPulse = async (w: DocsWatcher, act: () => void, ms = 3000): Promise<DocsPulse> => {
    await w.whenReady();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no pulse within ' + ms + 'ms')), ms);
      w.setPulseSubscriber(p => { clearTimeout(timer); resolve(p); });
      setTimeout(act, 50);
    });
  };

  it('pulses with the violation count when a written doc breaks the grammar', async () => {
    const write = setup();
    watcher = new DocsWatcher(root, 50);
    watcher.start();

    const pulse = await nextPulse(watcher, () => write('0002-b.md', adr('0002', '- Supersedes: 0099\n')));
    expect(pulse.event).toBe('docs');
    expect(pulse.violations).toBe(1);       // 0099 does not exist
  });

  it('pulses clean when the tree conforms', async () => {
    const write = setup();
    watcher = new DocsWatcher(root, 50);
    watcher.start();

    const pulse = await nextPulse(watcher, () => write('0003-c.md', adr('0003')));
    expect(pulse.violations).toBe(0);
    // `files` is every doc in the window. Nothing is seeded before `start()` on purpose: on macOS a
    // pre-existing file's `add` can be delivered AFTER chokidar reports ready, so seeding would put
    // an unrelated path in the window and make this flaky for a reason that is not the subject.
    expect(pulse.files).toEqual([path.join('docs', 'decisions', '0003-c.md')]);
  });

  it('debounces a burst — five writes do NOT become five re-lints', async () => {
    const write = setup();
    watcher = new DocsWatcher(root, 300);
    watcher.start();
    await watcher.whenReady();

    let pulses = 0;
    watcher.setPulseSubscriber(() => { pulses++; });
    const WRITES = 5;
    for (let i = 4; i < 4 + WRITES; i++) write(`000${i}-x.md`, adr(`000${i}`));

    // Wait for the CONDITION, not a fixed sleep — the original slept 600 ms and asserted, so under
    // load it read the counter before the debounce had fired.
    const deadline = Date.now() + 15000;
    while (pulses === 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
    // Then let anything still in flight land, so the count below is settled rather than sampled.
    await new Promise(r => setTimeout(r, 1500));

    // The contract is that a burst COLLAPSES, not that it collapses to exactly one.
    //
    // "Exactly 1" was asserted for a long time and is not load-independent: the write loop can
    // straddle any debounce window on a busy machine, and the watcher then fires twice — which is
    // CORRECT behaviour failing the test. That was met twice by widening the window (120 -> 500 ->
    // 2000 ms), and it failed again at 2000 ms under a six-suite run. Widening is unfalsifiable;
    // there is always a slower machine.
    //
    // This asserts what the debounce is FOR and what its absence would look like: without it, five
    // writes produce five re-lints. One or two is collapsing; five is not (todo60).
    expect(pulses).toBeGreaterThanOrEqual(1);
    expect(pulses).toBeLessThan(WRITES);
  });

  it('whenReady() means events are DELIVERED, not that the scan finished', async () => {
    // The defect this closes: chokidar emits `ready` when its initial SCAN completes, which on macOS
    // is before the fsevents stream is subscribed. A write landing in that gap produced NO event at
    // all — so a user who started the watcher and saved a doc a moment later got no re-lint, with no
    // error and no retry.
    //
    // MEASURED with six processes each writing 200 files in a loop: writing immediately after
    // `whenReady()` gave 0 pulses in NINETY SECONDS on one probe of three, and ~356ms on the others.
    // Binary — never, or immediate. A one-second settle after `whenReady()` made it 5/5, which is
    // what showed the gap was delivery and not slowness. After the fix: 6/6 under the same load.
    //
    // Asserted WITHOUT a settle on purpose: the write happens on the line after `whenReady()`, so
    // this fails if readiness ever goes back to being announced rather than proven.
    const write = setup();
    watcher = new DocsWatcher(root, 50);
    watcher.start();
    await watcher.whenReady();

    const pulse = await new Promise<DocsPulse | null>(resolve => {
      const timer = setTimeout(() => resolve(null), 10000);
      watcher!.setPulseSubscriber(p => { clearTimeout(timer); resolve(p); });
      write('0010-armed.md', adr('0010'));
    });
    expect(pulse).not.toBeNull();
  });

  it('never reports its own readiness probe as a changed doc', async () => {
    // The probe is a real write inside the watched tree, and its delete emits an `unlink` after the
    // proving window has closed. Filtered by NAME rather than by a live flag for exactly that
    // reason — otherwise arming would announce a file the user never touched.
    const write = setup();
    watcher = new DocsWatcher(root, 50);
    watcher.start();
    await watcher.whenReady();

    const pulse = await new Promise<DocsPulse | null>(resolve => {
      const timer = setTimeout(() => resolve(null), 10000);
      watcher!.setPulseSubscriber(p => { clearTimeout(timer); resolve(p); });
      write('0011-real.md', adr('0011'));
    });
    expect(pulse).not.toBeNull();
    expect(pulse!.files.join(' ')).not.toContain('conducks-watch-probe');
  });

  it('is inert without a docs/ dir, and stop() is safe when never started', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-watch-'));
    watcher = new DocsWatcher(root, 50);
    expect(() => watcher!.start()).not.toThrow();     // no docs/ — nothing to watch, no crash
    await expect(watcher.stop()).resolves.toBeUndefined();
  });
});
