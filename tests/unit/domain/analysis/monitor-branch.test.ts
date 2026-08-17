import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { ProjectRegistry } from '@/lib/domain/federation/index.js';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { FileHashGate } from "@/lib/core/persistence/index.js";

/**
 * The monitor's branch dimension (ADR 0035, todo20#P1).
 *
 * The whole point is the case the hashes CANNOT see: a vault pulsed on one branch while the
 * checkout is on another, with every file byte-identical between the two. `changed` is 0,
 * `graph.stale` is false, the report reads "graph current" — and every answer that vault gives is
 * about a tree nobody has checked out. So each test below asserts the hashes are clean AND the
 * mismatch is reported; asserting only the mismatch would pass for a report that had simply gone
 * stale in the ordinary way.
 *
 * Monitor is REPORT ONLY (ADR 0031). Nothing here may cause a pulse.
 */
describe('ProjectMonitor — branch identity is its own dimension', () => {
  let home = '';
  let project = '';
  let monitor: ProjectMonitor;
  let registry: ProjectRegistry;

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

  const write = (rel: string, body: string) => {
    const full = path.join(project, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    return full;
  };

  /** Seeds file hashes that MATCH disk, plus a pulse row on `branch`. */
  const seedVault = async (branch: string | null, files: Array<[string, string]>) => {
    const p = new SynapsePersistence(project, false);
    for (const [rel, body] of files) {
      write(rel, body);
      await p.setFileHash(path.join(project, rel), FileHashGate.hash(body), Buffer.byteLength(body));
    }
    await p.run(
      `INSERT INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['p1', Date.now(), 'deadbeef', branch, 0, 0, '{}']
    );
    await p.close();
  };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-home-'));
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-proj-'));
    registry = new ProjectRegistry(home);
    monitor = new ProjectMonitor(registry);
    registry.register(project, 'fixture');
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('reports a branch mismatch WHILE every file hash still matches', async () => {
    git('init', '-q', '-b', 'alpha');
    git('config', 'user.email', 'test@conducks.local');
    git('config', 'user.name', 'conducks test');
    await seedVault('alpha', [['src/a.ts', 'export const a = 1;']]);
    git('add', '.');
    git('commit', '-qm', 'first');

    // Switch WITHOUT changing a byte of source. This is the invisible failure.
    git('checkout', '-q', '-b', 'beta');

    const [report] = await monitor.reportAll();

    // The hash dimension is clean — it has nothing to complain about, and it is right.
    expect(report.graph.analyzed).toBe(true);
    expect(report.graph.changed).toBe(0);
    expect(report.graph.removed).toBe(0);
    expect(report.graph.stale).toBe(false);

    // …and the answer is still wrong, on its own line.
    expect(report.branch.vault).toBe('alpha');
    expect(report.branch.checkout).toBe('beta');
    expect(report.branch.mismatch).toBe(true);
  }, 60000);

  it('reports no mismatch while the checkout is on the branch that was pulsed', async () => {
    git('init', '-q', '-b', 'alpha');
    git('config', 'user.email', 'test@conducks.local');
    git('config', 'user.name', 'conducks test');
    await seedVault('alpha', [['src/a.ts', 'export const a = 1;']]);
    git('add', '.');
    git('commit', '-qm', 'first');

    const [report] = await monitor.reportAll();

    expect(report.branch.vault).toBe('alpha');
    expect(report.branch.checkout).toBe('alpha');
    expect(report.branch.mismatch).toBe(false);
  }, 60000);

  it('reports no mismatch for a project with NO repository — null is not a wrong branch', async () => {
    await seedVault('alpha', [['src/a.ts', 'export const a = 1;']]);

    const [report] = await monitor.reportAll();

    expect(report.branch.checkout).toBeNull();
    expect(report.branch.mismatch).toBe(false);
    expect(report.graph.analyzed).toBe(true);      // and it still answers everything else
  }, 60000);

  it('reports no mismatch for a vault written before the branch column existed', async () => {
    git('init', '-q', '-b', 'alpha');
    git('config', 'user.email', 'test@conducks.local');
    git('config', 'user.name', 'conducks test');
    await seedVault(null, [['src/a.ts', 'export const a = 1;']]);

    const [report] = await monitor.reportAll();

    expect(report.branch.vault).toBeNull();
    expect(report.branch.checkout).toBe('alpha');
    expect(report.branch.mismatch).toBe(false);
  }, 60000);
});
