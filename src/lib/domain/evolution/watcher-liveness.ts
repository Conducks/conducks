import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — is a watcher running here, and if not, was there one?
 *
 * `monitor` reported staleness and nothing about who was supposed to be fixing it, so a project
 * whose watcher had DIED looked exactly like a project that never had one: both showed drift, and
 * the two mean opposite things. "Nobody is watching this" is a configuration choice; "the thing that
 * was watching this fell over" is an incident, and it was invisible (todo21#P3).
 *
 * The marker is a file rather than a lock, because the question is diagnostic, not exclusive — two
 * watchers on one tree is a separate problem and DuckDB's own lock is what actually prevents the
 * damage. A stale marker must never stop anything from running.
 *
 * Liveness is decided by TWO signals, and it needs both:
 *
 *   - the pid still exists (`kill(pid, 0)`), which catches a crash
 *   - the heartbeat is recent, which catches a process that is alive but wedged
 *
 * The pid alone is not enough on a machine that recycles pids, and the heartbeat alone cannot tell a
 * clean exit from a hang. Together they are still a heuristic, which is why the state is reported
 * rather than acted on.
 */

/** Where the marker lives, beside the vault it describes. */
export const watcherMarkerPath = (root: string): string => path.join(root, '.conducks', 'watcher.json');

/**
 * How long a heartbeat stays believable.
 *
 * Generously longer than the refresh interval below: a watcher blocked in a long micro-pulse is
 * working, not dead, and calling it dead would turn a slow pulse into a false incident.
 */
export const HEARTBEAT_STALE_MS = 90_000;

/** How often a running watcher refreshes the marker. */
export const HEARTBEAT_INTERVAL_MS = 20_000;

export interface WatcherMarker {
  pid: number;
  startedAt: string;
  heartbeatAt: string;
}

export type WatcherLiveness =
  | { state: 'none' }
  | { state: 'live'; pid: number; startedAt: string }
  /** A marker exists and the process behind it does not, or stopped reporting. */
  | { state: 'dead'; pid: number; startedAt: string; heartbeatAt: string; reason: 'process gone' | 'heartbeat stale' };

/** True when a process with this id exists. Signal 0 checks without delivering anything. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to someone else — alive for our purposes.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Write the marker. Called on start and on every heartbeat. */
export function writeWatcherMarker(root: string, startedAt: string, now: Date): void {
  const file = watcherMarkerPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const marker: WatcherMarker = { pid: process.pid, startedAt, heartbeatAt: now.toISOString() };
  fs.writeFileSync(file, JSON.stringify(marker, null, 2));
}

/**
 * Remove the marker on a clean stop, so a deliberate shutdown reads as `none` rather than `dead`.
 *
 * Never throws: failing to clean up a diagnostic file must not fail a shutdown, and the worst case
 * is a marker the liveness check will correctly call dead on the next read.
 */
export function clearWatcherMarker(root: string): void {
  try { fs.unlinkSync(watcherMarkerPath(root)); } catch { /* already gone, or never written */ }
}

/**
 * What the marker says about this project right now.
 *
 * An unreadable or malformed marker is `none`, not an error: this is a report, and a project that
 * cannot answer becomes a line rather than an exception — the same rule the monitor already applies
 * to a vault it cannot open.
 */
export function readWatcherLiveness(root: string, now: Date = new Date()): WatcherLiveness {
  let marker: WatcherMarker;
  try {
    marker = JSON.parse(fs.readFileSync(watcherMarkerPath(root), 'utf8')) as WatcherMarker;
    if (typeof marker?.pid !== 'number' || !marker.heartbeatAt) return { state: 'none' };
  } catch {
    return { state: 'none' };
  }

  const { pid, startedAt, heartbeatAt } = marker;
  if (!pidAlive(pid)) return { state: 'dead', pid, startedAt, heartbeatAt, reason: 'process gone' };

  const age = now.getTime() - new Date(heartbeatAt).getTime();
  if (!Number.isFinite(age) || age > HEARTBEAT_STALE_MS) {
    return { state: 'dead', pid, startedAt, heartbeatAt, reason: 'heartbeat stale' };
  }
  return { state: 'live', pid, startedAt };
}
