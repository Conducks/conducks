import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';
import { branchGuard } from '@/interfaces/cli/index.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { ProjectRegistry } from '@/lib/domain/federation/project-registry.js';
import { buildBoard } from '@/lib/domain/analysis/docs-board.js';

/**
 * A project with NO git keeps answering everything it answers today (ADR 0035).
 *
 * "Without git there are no layers, and that is not a broken mode." Every layer is keyed by a
 * commit, so a directory with no repository has no commits, no branch and no target — and it must
 * degrade to exactly today's conducks: one flat graph, change detected by hashing on access. ADR
 * 0035 stated this as a consequence and no phase claimed it, so nothing held the git-shaped work to
 * it. This file is that hold.
 *
 * The risk is specific and it is the reason for each assertion below: every git feature added since
 * reads a branch or a target, and the natural way to write each of them turns "cannot resolve" into
 * a failure. The rule is the opposite — no command may REQUIRE a repository to answer.
 */

const roots: string[] = [];
const mkPlainDir = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-nogit-'));
  roots.push(root);
  // Deliberately no `git init`. Assert it, so a stray repo in tmpdir cannot make this vacuous.
  expect(fs.existsSync(path.join(root, '.git'))).toBe(false);
  return root;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

describe('a directory with no .git', () => {
  it('has no repository, no branch and no target — and says so instead of inventing one', () => {
    const chronicle = new ChronicleInterface(mkPlainDir());

    expect(chronicle.isRepository()).toBe(false);
    expect(chronicle.getCurrentBranch()).toBeNull();
    // Not `main`. There is no repository to fork from, so a target would be pure fabrication.
    expect(chronicle.resolveTarget()).toBeNull();
  }, 30000);

  it('PULSES: a vault opens, records a pulse and reads it back', async () => {
    const root = mkPlainDir();
    const p = new SynapsePersistence(root, false);
    try {
      await p.run(
        `INSERT INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['p1', Date.now(), null, null, 3, 2, '{}']
      );
      const rows = await p.query<{ id: string; branch: string | null }>('SELECT id, branch FROM pulses');
      expect(rows).toHaveLength(1);
      // No commit and no branch is the CORRECT record here, not a degraded one.
      expect(rows[0].branch).toBeNull();
    } finally { await p.close(); }
  }, 60000);

  it('QUERIES: the branch guard never fires, so read commands are not blocked', async () => {
    const root = mkPlainDir();
    const p = new SynapsePersistence(root, false);
    try {
      await p.run(
        `INSERT INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['p1', Date.now(), null, null, 0, 0, '{}']
      );
      // Both sides null. A guard that treated "cannot tell" as a mismatch would refuse every read
      // command in every non-git project — the exact regression ADR 0035 forbids.
      expect(await branchGuard(p, new ChronicleInterface(root))).toBeNull();
    } finally { await p.close(); }
  }, 60000);

  it('QUERIES: nodes written into the one flat graph come back out', async () => {
    const root = mkPlainDir();
    const p = new SynapsePersistence(root, false);
    try {
      await p.run(`INSERT INTO nodes (id, pulseId, name, file, canonicalKind)
                   VALUES ('n1', 'p1', 'alpha', '/x/a.ts', 'UNIT'), ('n2', 'p1', 'beta', '/x/b.ts', 'UNIT')`);
      const rows = await p.query<{ name: string }>('SELECT name FROM nodes ORDER BY name');
      expect(rows.map(r => r.name)).toEqual(['alpha', 'beta']);
    } finally { await p.close(); }
  }, 60000);

  it('LINTS: docs are read and graded with no repository present', () => {
    const root = mkPlainDir();
    fs.mkdirSync(path.join(root, 'docs', 'todos'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'todos', 'todo01.md'), '# todo01 — a thing\n\nStatus: nonsense\n');

    const board = buildBoard(root);

    // The grammar reads authored markdown and the filesystem; git is not in that path and must not
    // become a precondition for it.
    expect(board.lint.reduce((n, l) => n + l.errs.length, 0)).toBeGreaterThan(0);
  }, 30000);

  it('MONITORS: freshness is answered by hashing, with no branch line to report', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-home-'));
    roots.push(home);
    const root = mkPlainDir();

    const registry = new ProjectRegistry(home);
    registry.register(root, 'nogit');

    const p = new SynapsePersistence(root, false);
    const rel = 'src/a.ts';
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, rel), 'export const a = 1;');
    const { FileHashGate } = await import('@/lib/core/persistence/file-hash-gate.js');
    await p.setFileHash(path.join(root, rel), FileHashGate.hash('export const a = 1;'), 19);
    await p.close();

    // Change it: staleness must still be DETECTED, by hashing on access, exactly as today.
    fs.writeFileSync(path.join(root, rel), 'export const a = 2;');

    const [report] = await new ProjectMonitor(registry).reportAll();

    expect(report.graph.analyzed).toBe(true);
    expect(report.graph.changed).toBe(1);
    expect(report.graph.stale).toBe(true);
    // No repository, so nothing to say about branches — and crucially not a mismatch.
    expect(report.branch.checkout).toBeNull();
    expect(report.branch.mismatch).toBe(false);
  }, 60000);
});
