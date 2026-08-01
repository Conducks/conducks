import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { classifyFreshness, isStale } from '@/lib/core/persistence/freshness.js';
import { FileHashGate } from '@/lib/core/persistence/file-hash-gate.js';

/**
 * The ONE engine `watch` and `monitor` are surfaces over (ADR 0036, todo21#P3).
 *
 * The split had a real cost rather than being untidy: the watcher runs with `ignoreInitial: true`
 * and performed NO reconcile, so every edit made while it was not running was invisible to it. The
 * monitor could compute exactly that set and the watcher had no way to ask for it. That is why the
 * merge was worth doing.
 */
const EXTS = new Set(['.ts', '.js']);
const ext = (p: string) => path.extname(p);
const H = (s: string) => FileHashGate.hash(s);

/** A fake disk: content by path. Absent means the file does not exist. */
const disk = (files: Record<string, string>) => ({
  read: (p: string) => (p in files ? files[p] : null),
  exists: (p: string) => p in files,
});

describe('classifying a vault against disk', () => {
  it('reports nothing when every file matches', () => {
    const d = disk({ '/p/a.ts': 'A', '/p/b.ts': 'B' });
    const f = classifyFreshness(new Map([['/p/a.ts', H('A')], ['/p/b.ts', H('B')]]),
      ['/p/a.ts', '/p/b.ts'], EXTS, d.read, d.exists, ext);
    expect(f).toMatchObject({ changed: [], added: [], removed: [], tracked: 2 });
    expect(isStale(f)).toBe(false);
  });

  it('reports a file whose content moved', () => {
    const d = disk({ '/p/a.ts': 'EDITED' });
    const f = classifyFreshness(new Map([['/p/a.ts', H('A')]]), ['/p/a.ts'], EXTS, d.read, d.exists, ext);
    expect(f.changed).toEqual(['/p/a.ts']);
    expect(isStale(f)).toBe(true);
  });

  it('reports a file the vault has never seen as ADDED, not changed', () => {
    const d = disk({ '/p/new.ts': 'N' });
    const f = classifyFreshness(new Map(), ['/p/new.ts'], EXTS, d.read, d.exists, ext);
    expect(f.added).toEqual(['/p/new.ts']);
    expect(f.changed).toEqual([]);
  });

  /**
   * `added` is COVERAGE, not staleness. `analyze` is incremental by mtime, so a file untouched since
   * before the last pulse never enters a wave and never gets a hash — counting those as stale
   * reported "graph behind" immediately after a clean pulse, which trains the reader to ignore the
   * line.
   */
  it('does NOT call the graph stale for added files alone', () => {
    const d = disk({ '/p/new.ts': 'N' });
    const f = classifyFreshness(new Map(), ['/p/new.ts'], EXTS, d.read, d.exists, ext);
    expect(f.added).toHaveLength(1);
    expect(isStale(f)).toBe(false);
  });

  it('reports a tracked file that is gone from disk', () => {
    const d = disk({});
    const f = classifyFreshness(new Map([['/p/gone.ts', H('G')]]), [], EXTS, d.read, d.exists, ext);
    expect(f.removed).toEqual(['/p/gone.ts']);
    expect(isStale(f)).toBe(true);
  });

  /**
   * The subtlety that cost a false "graph behind" on every clean pulse. A pulse hashes EVERY file it
   * analyzed — package.json, markdown, config — while a caller typically walks source extensions
   * only, so a plain set difference reports all of those as deleted.
   */
  it('does not report a non-source file as removed just because the caller did not walk it', () => {
    const d = disk({});
    const f = classifyFreshness(
      new Map([['/p/package.json', H('{}')], ['/p/readme.md', H('#')]]),
      [], EXTS, d.read, d.exists, ext);
    expect(f.removed).toEqual([]);
    expect(isStale(f)).toBe(false);
  });

  /** An unreadable file is not evidence of change — a permissions error must not look like an edit. */
  it('skips a file it cannot read rather than calling it changed', () => {
    const f = classifyFreshness(new Map([['/p/locked.ts', H('L')]]), ['/p/locked.ts'], EXTS,
      () => null, () => true, ext);
    expect(f.changed).toEqual([]);
    expect(isStale(f)).toBe(false);
  });

  it('matches stored keys case-insensitively, as the vault stores them lowercased', () => {
    const d = disk({ '/P/A.ts': 'A' });
    const f = classifyFreshness(new Map([['/p/a.ts', H('A')]]), ['/P/A.ts'], EXTS, d.read, d.exists, ext);
    expect(f.changed).toEqual([]);
    expect(f.added).toEqual([]);
  });

  it('classifies a mixed tree in one pass', () => {
    const d = disk({ '/p/same.ts': 'S', '/p/edited.ts': 'NEW', '/p/fresh.ts': 'F' });
    const f = classifyFreshness(
      new Map([['/p/same.ts', H('S')], ['/p/edited.ts', H('OLD')], ['/p/gone.ts', H('G')]]),
      ['/p/same.ts', '/p/edited.ts', '/p/fresh.ts'], EXTS, d.read, d.exists, ext);
    expect(f.changed).toEqual(['/p/edited.ts']);
    expect(f.added).toEqual(['/p/fresh.ts']);
    expect(f.removed).toEqual(['/p/gone.ts']);
    expect(f.tracked).toBe(3);
  });
});
