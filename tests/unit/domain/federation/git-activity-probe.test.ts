import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probeGitActivity, sameGitActivity } from '@/lib/domain/federation/project-registry.js';

/**
 * todo21#P2 — inactive projects are ASKED, not watched (ADR 0036).
 *
 * The probe is two `stat` calls, and its value is entirely in what it refuses to claim. It is a
 * cheap NEGATIVE filter: "nothing git-visible moved, so do not bother with the expensive answer".
 * It is never a freshness proof, and "cannot tell" must never be mistaken for "nothing changed" —
 * that mistake is silent and permanent, because a project wrongly declared unchanged is never
 * examined again.
 */
const dirs: string[] = [];
const mkdir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-probe-'));
  dirs.push(d);
  return d;
};
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

/** A normal clone: `.git` is a directory holding HEAD and index. */
function fakeClone(): string {
  const root = mkdir();
  const git = path.join(root, '.git');
  fs.mkdirSync(git);
  fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(git, 'index'), 'binary-ish');
  return root;
}

describe('probeGitActivity', () => {
  it('cannot tell for a directory that is not a repository', () => {
    expect(probeGitActivity(mkdir())).toBeNull();
  });

  it('reads HEAD and index mtimes from a normal clone', () => {
    const root = fakeClone();

    const probe = probeGitActivity(root);

    expect(probe).not.toBeNull();
    expect(probe!.head).toBe(fs.statSync(path.join(root, '.git', 'HEAD')).mtimeMs);
    expect(probe!.index).toBe(fs.statSync(path.join(root, '.git', 'index')).mtimeMs);
  });

  /**
   * The case that would have shipped broken. Conducks itself is developed in linked worktrees, where
   * `.git` is a FILE pointing at the real gitdir — so reading `<root>/.git/HEAD` would answer "not a
   * repository" for precisely the projects most likely to be active right now.
   */
  it('follows the gitdir pointer when .git is a file, as in a linked worktree', () => {
    const root = mkdir();
    const realGitDir = path.join(mkdir(), 'worktrees', 'agent-01');
    fs.mkdirSync(realGitDir, { recursive: true });
    fs.writeFileSync(path.join(realGitDir, 'HEAD'), 'ref: refs/heads/feature\n');
    fs.writeFileSync(path.join(realGitDir, 'index'), 'x');
    fs.writeFileSync(path.join(root, '.git'), `gitdir: ${realGitDir}\n`);

    const probe = probeGitActivity(root);

    expect(probe).not.toBeNull();
    expect(probe!.head).toBe(fs.statSync(path.join(realGitDir, 'HEAD')).mtimeMs);
  });

  it('resolves a relative gitdir pointer against the root that contains it', () => {
    const root = mkdir();
    const realGitDir = path.join(root, 'nested', 'gitdir');
    fs.mkdirSync(realGitDir, { recursive: true });
    fs.writeFileSync(path.join(realGitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(root, '.git'), 'gitdir: nested/gitdir\n');

    expect(probeGitActivity(root)).not.toBeNull();
  });

  /** Never staged is a real answer, not a failure — it must not collapse the probe to "cannot tell". */
  it('reports index 0 for a repository that has never staged anything', () => {
    const root = mkdir();
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');

    const probe = probeGitActivity(root);

    expect(probe).toEqual({ head: expect.any(Number), index: 0 });
  });

  it('cannot tell when .git exists but HEAD does not', () => {
    const root = mkdir();
    fs.mkdirSync(path.join(root, '.git'));

    expect(probeGitActivity(root)).toBeNull();
  });
});

describe('sameGitActivity', () => {
  it('is true when nothing moved', () => {
    const root = fakeClone();

    expect(sameGitActivity(probeGitActivity(root), probeGitActivity(root))).toBe(true);
  });

  it('is false once HEAD moves, which is what a commit or a checkout does', () => {
    const root = fakeClone();
    const before = probeGitActivity(root);

    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(path.join(root, '.git', 'HEAD'), later, later);

    expect(sameGitActivity(before, probeGitActivity(root))).toBe(false);
  });

  it('is false once index moves, which is what staging does', () => {
    const root = fakeClone();
    const before = probeGitActivity(root);

    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(path.join(root, '.git', 'index'), later, later);

    expect(sameGitActivity(before, probeGitActivity(root))).toBe(false);
  });

  /**
   * The load-bearing case. Two unreadable probes are not evidence of sameness, and treating them as
   * equal would freeze every non-git project into "unchanged" for good.
   */
  it('refuses to call two unreadable probes the same', () => {
    expect(sameGitActivity(null, null)).toBe(false);
    expect(sameGitActivity({ head: 1, index: 2 }, null)).toBe(false);
    expect(sameGitActivity(null, { head: 1, index: 2 })).toBe(false);
  });
});
