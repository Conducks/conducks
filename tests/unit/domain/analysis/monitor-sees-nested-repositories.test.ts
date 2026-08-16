import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { ProjectRegistry } from '@/lib/domain/federation/project-registry.js';
import { SynapsePersistence } from '@/lib/core/persistence/index.js';

/**
 * The monitor asks the GIT FEATURE which files exist, and this is the difference that makes.
 *
 * It used to spawn `git ls-files` itself, in a private copy that asked only the anchor repository.
 * A repository with another repository nested inside it — a vendored dependency, a submodule, a
 * fixture — has files that the anchor's `ls-files` never names, so `status` reported a tree smaller
 * than the one `analyze` had ingested. Measured on this repository at the time of the change: the
 * private copy saw 575 source files and the git feature saw 578, and the three it had been missing
 * were every file under `tests/fixtures/mock-repo`, a nested checkout.
 *
 * ADR 0069 already said discovery asks every repository under the anchor. The monitor was outside
 * that rule only because it had its own copy — which is what ADR 0150 rule 9 forbids (todo70).
 *
 * Monitor is REPORT ONLY (ADR 0031). Nothing here may cause a pulse.
 */
describe('ProjectMonitor — counts files inside nested repositories', () => {
  let home = '';
  let project = '';
  let monitor: ProjectMonitor;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

  const write = (rel: string, body: string) => {
    const full = path.join(project, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    return full;
  };

  /** A vault that knows about NO file, so everything on disk is reported as `added`. */
  const seedEmptyVault = async () => {
    const p = new SynapsePersistence(project, false);
    await p.run(
      `INSERT INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['p1', Date.now(), 'deadbeef', null, 0, 0, '{}']
    );
    await p.close();
  };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-home-'));
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-proj-'));
    const registry = new ProjectRegistry(home);
    monitor = new ProjectMonitor(registry);
    registry.register(project, 'fixture');
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('sees a file that only the NESTED repository knows about', async () => {
    git(project, 'init', '-q', '-b', 'main');
    write('src/own.ts', 'export const own = 1;');

    // A checkout inside the checkout. The anchor's `ls-files --others` names the DIRECTORY
    // `vendor/dep/` and stops there — it never descends into another repository's working tree.
    const nested = path.join(project, 'vendor', 'dep');
    fs.mkdirSync(nested, { recursive: true });
    git(nested, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(nested, 'inner.ts'), 'export const inner = 2;');

    await seedEmptyVault();

    const [report] = await monitor.reportAll();

    // Both files, not just the anchor's one. Asserting the COUNT and not merely ">0" is the point:
    // the private copy returned exactly 1 here and looked entirely healthy doing it.
    expect(report.graph.added).toBe(2);

    // `stale` counts CHANGED and REMOVED only, so an added file does not raise it (`isStale`).
    // Pinned so the count above is read as the whole claim and not half of one.
    expect(report.graph.stale).toBe(false);
  }, 60000);

  it('still counts a plain single-repository project the same way it always did', async () => {
    // The counter-test. A fix that only ever counts MORE would pass the case above by walking the
    // filesystem and ignoring git, which would put `node_modules` back into every count.
    git(project, 'init', '-q', '-b', 'main');
    write('src/a.ts', 'export const a = 1;');
    write('src/b.ts', 'export const b = 2;');
    write('node_modules/pkg/index.ts', 'export const ignored = 3;');
    fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules\n');

    await seedEmptyVault();

    const [report] = await monitor.reportAll();

    expect(report.graph.added).toBe(2);
  }, 60000);

  it('answers for a project with NO repository at all', async () => {
    // The old copy fell back to a private filesystem walk here. The git feature has its own
    // fallback scan, so the case still answers — this pins that it does, because losing it would
    // make `status` blind to every non-git project rather than merely slower.
    write('src/a.ts', 'export const a = 1;');
    await seedEmptyVault();

    const [report] = await monitor.reportAll();

    expect(report.graph.analyzed).toBe(true);
    expect(report.graph.added).toBe(1);
  }, 60000);
});
