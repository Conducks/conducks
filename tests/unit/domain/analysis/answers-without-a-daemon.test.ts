import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { ProjectRegistry, probeGitActivity } from '@/lib/domain/federation/index.js';
import { writeWatcherMarker, clearWatcherMarker } from '@/lib/domain/evolution/watcher-liveness.js';

/**
 * todo21#P3 — a daemon is an ACCELERATOR, never a requirement (ADR 0036).
 *
 * CI has no daemon. A gate that only works while something runs in the background cannot gate a
 * pull request, so every command must answer correctly with nothing running at all.
 *
 * The sharp version of that rule, and what these tests pin: watcher liveness is purely DIAGNOSTIC.
 * The substantive answer — graph freshness, docs violations, drifted notes — must be byte-identical
 * whether a watcher is live, dead, or was never started. If liveness ever leaks into the answer, the
 * report becomes a function of what happens to be running on the machine reading it, and two people
 * asking the same question about the same commit get different results.
 */
const tmp: string[] = [];
const mkProject = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-cold-'));
  tmp.push(root);
  fs.mkdirSync(path.join(root, 'src', 'lib', 'foo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'modules', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'docs', 'modules', 'foo', 'MODULE.md'), '# foo\n');
  return root;
};
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const asProject = (root: string) => ({
  root, name: path.basename(root), registeredAt: Date.now(), lastSetupAt: Date.now(),
});

/** Everything the report says EXCEPT the liveness diagnostic. */
const substance = <T extends { watcher: unknown }>(report: T) => {
  const { watcher, ...rest } = report;
  return rest;
};

/** A pid that is certainly not running, so the marker reads as a crashed watcher. */
const DEAD_PID = 0x7ffffffe;

describe('the monitor answers with nothing running', () => {
  it('reports a project that has never been analyzed instead of failing', async () => {
    const root = mkProject();

    const report = await new ProjectMonitor().report(asProject(root));

    expect(report.watcher.state).toBe('none');
    expect(report.graph.analyzed).toBe(false);
    expect(report.unavailable).toBeUndefined();
  });

  it('reports an empty registry as no projects, not as an error', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-home-'));
    tmp.push(home);

    await expect(new ProjectMonitor(new ProjectRegistry(home)).reportAll()).resolves.toEqual([]);
  });

  it('reports a registered root that has vanished as a line rather than an exception', async () => {
    const root = mkProject();
    const project = asProject(root);
    fs.rmSync(root, { recursive: true, force: true });

    const report = await new ProjectMonitor().report(project);

    expect(report.unavailable).toBeTruthy();
  });
});

describe('watcher liveness never changes the answer', () => {
  it('gives the same substantive report cold, live and dead', async () => {
    const root = mkProject();
    const project = asProject(root);
    const monitor = new ProjectMonitor();

    const cold = await monitor.report(project);

    writeWatcherMarker(root, new Date().toISOString(), new Date());
    const live = await monitor.report(project);

    fs.writeFileSync(
      path.join(root, '.conducks', 'watcher.json'),
      JSON.stringify({ pid: DEAD_PID, startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }),
    );
    const dead = await monitor.report(project);

    // The diagnostic moves...
    expect(cold.watcher.state).toBe('none');
    expect(live.watcher.state).toBe('live');
    expect(dead.watcher.state).toBe('dead');

    // ...and nothing else does. The keys are asserted first so this comparison can never quietly
    // become two empty objects agreeing with each other.
    //
    // `branch` joined this list when the branch guard landed (todo20#P1). It is listed rather than
    // the assertion being loosened: this test caught that addition as a cross-agent contract break —
    // one agent added a field to `ProjectReport` while another was asserting its exact shape — and a
    // `toContain` here would have let the next such change through silently, which is the whole
    // thing it exists to prevent.
    expect(Object.keys(substance(cold)).sort()).toEqual(['branch', 'docs', 'drift', 'graph', 'name', 'root']);
    expect(substance(live)).toEqual(substance(cold));
    expect(substance(dead)).toEqual(substance(cold));
  });

  it('reads as none again after a clean stop, so a deliberate shutdown is not an incident', async () => {
    const root = mkProject();
    writeWatcherMarker(root, new Date().toISOString(), new Date());

    clearWatcherMarker(root);

    expect((await new ProjectMonitor().report(asProject(root))).watcher.state).toBe('none');
  });
});

describe('the cheap probe needs nothing running either', () => {
  it('answers from two stats with no watcher and no vault', () => {
    const root = mkProject();
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');

    expect(probeGitActivity(root)).toEqual({ head: expect.any(Number), index: 0 });
  });
});
