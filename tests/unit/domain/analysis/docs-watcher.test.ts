import { describe, it, expect, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DocsWatcher, type DocsPulse } from '@/lib/domain/analysis/docs-watcher.js';

// The gate only ran when someone typed `docs-lint`, so a broken link survived until review. This
// closes that window — and must do it without ever throwing at the author mid-save.
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

  it('debounces a burst into one re-lint — an editor writing twice is not two passes', async () => {
    const write = setup();
    watcher = new DocsWatcher(root, 120);
    watcher.start();
    await watcher.whenReady();

    let pulses = 0;
    watcher.setPulseSubscriber(() => { pulses++; });
    for (let i = 4; i < 9; i++) write(`000${i}-x.md`, adr(`000${i}`));
    await new Promise(r => setTimeout(r, 600));
    expect(pulses).toBe(1);
  });

  it('is inert without a docs/ dir, and stop() is safe when never started', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-watch-'));
    watcher = new DocsWatcher(root, 50);
    expect(() => watcher!.start()).not.toThrow();     // no docs/ — nothing to watch, no crash
    await expect(watcher.stop()).resolves.toBeUndefined();
  });
});
