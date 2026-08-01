import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksWatcher } from '@/lib/domain/evolution/watcher.js';
import {
  readWatcherLiveness, writeWatcherMarker, clearWatcherMarker, watcherMarkerPath, HEARTBEAT_STALE_MS,
} from '@/lib/domain/evolution/watcher-liveness.js';

/**
 * todo21#P3 — a DEAD watcher must not look identical to no watcher.
 *
 * `monitor` reported staleness and nothing about who was supposed to be fixing it, so a project
 * whose watcher had died looked exactly like one that never had a watcher: both showed drift. They
 * mean opposite things. Nobody watching is a configuration choice; the watcher falling over is an
 * incident nobody was told about, and staleness is its SYMPTOM rather than the finding.
 */
const roots: string[] = [];
const mkRoot = () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-live-'));
  roots.push(r);
  return r;
};
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

/** A pid that is certainly not running. 0 and negatives are special to `kill`, so use a high one. */
const DEAD_PID = 0x7ffffffe;

const writeRaw = (root: string, marker: unknown) => {
  const f = watcherMarkerPath(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(marker));
};

describe('watcher liveness', () => {
  it('reports `none` when no watcher ever ran here', () => {
    expect(readWatcherLiveness(mkRoot())).toEqual({ state: 'none' });
  });

  it('reports `live` for this process with a fresh heartbeat', () => {
    const root = mkRoot();
    writeWatcherMarker(root, '2026-08-01T00:00:00.000Z', new Date());
    const l = readWatcherLiveness(root);
    expect(l.state).toBe('live');
    expect(l).toMatchObject({ pid: process.pid });
  });

  /** The case the whole thing exists for: a marker whose process is gone. */
  it('reports `dead` when the process behind the marker no longer exists', () => {
    const root = mkRoot();
    writeRaw(root, { pid: DEAD_PID, startedAt: 'x', heartbeatAt: new Date().toISOString() });
    expect(readWatcherLiveness(root)).toMatchObject({ state: 'dead', reason: 'process gone' });
  });

  /**
   * The pid alone is not enough: a process can be alive and wedged. This one IS running — it is this
   * test — and is still called dead, because it stopped reporting.
   */
  it('reports `dead` for a live process whose heartbeat went stale', () => {
    const root = mkRoot();
    const old = new Date(Date.now() - HEARTBEAT_STALE_MS - 1_000);
    writeWatcherMarker(root, '2026-08-01T00:00:00.000Z', old);
    expect(readWatcherLiveness(root)).toMatchObject({ state: 'dead', reason: 'heartbeat stale' });
  });

  it('a clean stop reads as `none`, not as `dead`', () => {
    const root = mkRoot();
    writeWatcherMarker(root, '2026-08-01T00:00:00.000Z', new Date());
    expect(readWatcherLiveness(root).state).toBe('live');
    clearWatcherMarker(root);
    expect(readWatcherLiveness(root)).toEqual({ state: 'none' });
  });

  it('clearing a marker that was never written does not throw', () => {
    expect(() => clearWatcherMarker(mkRoot())).not.toThrow();
  });

  /**
   * This is a REPORT. A project that cannot answer becomes a line rather than an exception — the
   * same rule the monitor already applies to a vault it cannot open.
   */
  it('treats a malformed marker as `none` rather than failing the report', () => {
    const root = mkRoot();
    const f = watcherMarkerPath(root);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'not json at all');
    expect(readWatcherLiveness(root)).toEqual({ state: 'none' });
  });

  it('treats a marker missing its fields as `none`', () => {
    const root = mkRoot();
    writeRaw(root, { startedAt: 'x' });
    expect(readWatcherLiveness(root)).toEqual({ state: 'none' });
  });

  it('treats an unparseable heartbeat as dead rather than as fresh', () => {
    const root = mkRoot();
    writeRaw(root, { pid: process.pid, startedAt: 'x', heartbeatAt: 'never' });
    expect(readWatcherLiveness(root)).toMatchObject({ state: 'dead' });
  });
});

/**
 * A watcher session's churn is reclaimed on SHUTDOWN (todo21#P1).
 *
 * DuckDB never reclaims deleted row versions (ADR 0037), and every micro-pulse purges a unit's rows
 * and re-inserts them. Only `analyze` called `reclaimIfBloated`, so a long watcher session grew the
 * vault with nothing ever reclaiming it.
 *
 * Shutdown, not per-pulse: the gate is one cheap query, but when it fires it rewrites the whole
 * file, and a multi-second pause mid-save-loop is the "accelerator that became a requirement"
 * ADR 0036 warns about. At shutdown nobody is waiting.
 */
describe('a watcher reclaims its own churn when it stops', () => {
  const mkWatcher = (persistence: unknown) => {
    const root = mkRoot();
    // Constructed directly with a stub persistence: the reclaim contract is what is under test, and
    // a real vault would test DuckDB rather than the call.
    return new ConducksWatcher(root, { getGraph: () => ({}) } as never, { persistence } as never);
  };

  it('asks the vault to reclaim, with the bloat ratio gate', async () => {
    const calls: number[] = [];
    const w = mkWatcher({ reclaimIfBloated: async (r: number) => { calls.push(r); return null; } });
    await w.stop();
    expect(calls).toEqual([3]);
  });

  it('does not fail the shutdown when reclaim throws', async () => {
    const w = mkWatcher({ reclaimIfBloated: async () => { throw new Error('vault locked'); } });
    await expect(w.stop()).resolves.toBeUndefined();
  });

  it('stops cleanly when there is no persistence at all', async () => {
    const w = mkWatcher(undefined);
    await expect(w.stop()).resolves.toBeUndefined();
  });
});
