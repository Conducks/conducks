import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvolutionService } from '@/lib/domain/evolution/index.js';
import { ProjectRegistry } from '@/lib/domain/federation/project-registry.js';
import { readWatcherLiveness, watcherMarkerPath } from '@/lib/domain/evolution/watcher-liveness.js';

/**
 * todo21#P2 — watched is not registered (ADR 0036).
 *
 * A watcher exists because a SESSION is using a project right now. Appearing in
 * `~/.conducks/projects.json` is a list entry and nothing more: it must never, by itself, cause a
 * filesystem watcher to exist. The failure this guards against does not announce itself — it looks
 * like a laptop fan, twenty chokidar trees over twenty repositories nobody has open, and the
 * registry grows every time someone runs `conducks setup`.
 *
 * The named acceptance is twenty registered projects and one open session creating exactly one
 * watcher, and it is asserted two independent ways: the count the service holds, and the liveness
 * markers actually on disk.
 */
const tmp: string[] = [];
const mkdir = (prefix: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmp.push(d);
  return d;
};

let live: EvolutionService | null = null;
afterEach(async () => {
  await live?.stopWatchers();
  live = null;
  while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true });
});

/** The watcher only stores the graph; nothing in start/stop touches it. */
const stubGraph = () => ({ getGraph: () => ({}) }) as any;

const newService = () => {
  const service = new EvolutionService(stubGraph(), undefined);
  live = service;
  return service;
};

/** How many of these roots actually have a watcher marker on disk. */
const markersOn = (roots: string[]) => roots.filter(r => fs.existsSync(watcherMarkerPath(r))).length;

describe('registration never creates a watcher', () => {
  it('twenty registered projects and one open session create exactly one watcher', async () => {
    const home = mkdir('conducks-home-');
    const registry = new ProjectRegistry(home);
    const roots = Array.from({ length: 20 }, () => mkdir('conducks-proj-'));
    for (const root of roots) registry.register(root);

    const evolution = newService();

    // Registration alone: twenty entries, zero watchers.
    expect(registry.list()).toHaveLength(20);
    expect(evolution.watcherCount).toBe(0);
    expect(markersOn(roots)).toBe(0);

    // One session opens ONE of them.
    const session = roots[7];
    evolution.getWatcher(session)!.start();

    expect(evolution.watcherCount).toBe(1);
    expect(markersOn(roots)).toBe(1);
    expect(readWatcherLiveness(session).state).toBe('live');
    for (const other of roots.filter(r => r !== session)) {
      expect(readWatcherLiveness(other).state).toBe('none');
    }
  });

  it('listing the registry does not touch the watcher set', () => {
    const home = mkdir('conducks-home-');
    const registry = new ProjectRegistry(home);
    const roots = Array.from({ length: 5 }, () => mkdir('conducks-proj-'));
    for (const root of roots) registry.register(root);
    const evolution = newService();

    registry.list();
    registry.missingRoots();

    expect(evolution.watcherCount).toBe(0);
    expect(markersOn(roots)).toBe(0);
  });
});

describe('a watcher is identified by its project root', () => {
  it('returns the same watcher when the same root is asked for twice', () => {
    const root = mkdir('conducks-proj-');
    const evolution = newService();

    expect(evolution.getWatcher(root)).toBe(evolution.getWatcher(root));
    expect(evolution.watcherCount).toBe(1);
  });

  it('resolves the root, so an unnormalised path is not a second watcher', () => {
    const root = mkdir('conducks-proj-');
    const evolution = newService();

    evolution.getWatcher(root);
    evolution.getWatcher(path.join(root, 'sub', '..'));

    expect(evolution.watcherCount).toBe(1);
  });

  /**
   * Two projects open means two watchers (ADR 0036). The previous flat singleton returned the FIRST
   * watcher ever created whatever root was asked for, so a second project would have been handed
   * another project's watcher and pulsed its edits into the wrong graph.
   */
  it('gives a second project its own watcher rather than the first one', () => {
    const a = mkdir('conducks-proj-');
    const b = mkdir('conducks-proj-');
    const evolution = newService();

    const watcherA = evolution.getWatcher(a);
    const watcherB = evolution.getWatcher(b);

    expect(watcherB).not.toBe(watcherA);
    expect(evolution.watcherCount).toBe(2);
  });

  it('refuses a root that is the filesystem root', () => {
    const evolution = newService();

    expect(evolution.getWatcher('/')).toBeNull();
    expect(evolution.getWatcher('')).toBeNull();
    expect(evolution.watcherCount).toBe(0);
  });
});

describe('a watcher dies with the session that made it', () => {
  it('stopping the session removes every marker it wrote', async () => {
    const roots = [mkdir('conducks-proj-'), mkdir('conducks-proj-')];
    const evolution = newService();
    for (const root of roots) evolution.getWatcher(root)!.start();
    expect(markersOn(roots)).toBe(2);

    await evolution.stopWatchers();

    expect(evolution.watcherCount).toBe(0);
    expect(markersOn(roots)).toBe(0);
    for (const root of roots) expect(readWatcherLiveness(root).state).toBe('none');
  });
});
