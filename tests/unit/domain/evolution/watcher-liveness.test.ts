import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
