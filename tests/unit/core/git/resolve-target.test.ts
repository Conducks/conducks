import { describe, it, expect, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

/**
 * `resolveTarget` — the baseline a branch is compared against (ADR 0035, todo20#P2).
 *
 * The thing under test is as much what it REFUSES as what it resolves. ADR 0035 rejected pinning
 * `main` because it is wrong for anyone branching off `develop` or stacking branches, and
 * CONDUCKS-13 is the record of what a wrong baseline costs: a diff that looks right and is not. So
 * "cannot tell" must come back as null and never as a guess.
 */

const roots: string[] = [];

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const mkRepo = (initialBranch = 'main'): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-target-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', initialBranch);
  git(root, 'config', 'user.email', 'test@conducks.local');
  git(root, 'config', 'user.name', 'conducks test');
  return root;
};

const commit = (root: string, name: string): string => {
  fs.writeFileSync(path.join(root, `${name}.txt`), name);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', name);
  return git(root, 'rev-parse', 'HEAD');
};

afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

describe('resolveTarget — resolved from git, never assumed', () => {
  it('resolves a branch off a NON-MAIN parent to that parent, not to main', () => {
    // main(A) ─ develop(B) ─ feature(C).  The right baseline for `feature` is B, on `develop`.
    const root = mkRepo('main');
    commit(root, 'A');
    git(root, 'checkout', '-q', '-b', 'develop');
    const b = commit(root, 'B');
    git(root, 'checkout', '-q', '-b', 'feature');
    commit(root, 'C');

    const target = new ChronicleInterface(root).resolveTarget();

    expect(target).not.toBeNull();
    expect(target!.ref).toBe('develop');
    expect(target!.via).toBe('merge-base');
    // The FORK POINT, not develop's tip — diffing against the tip would attribute develop's own
    // later commits to `feature`.
    expect(target!.commit).toBe(b);
  }, 30000);

  it('prefers the configured upstream tracking ref over the fork-point search', () => {
    const root = mkRepo('main');
    const a = commit(root, 'A');
    git(root, 'checkout', '-q', '-b', 'develop');
    commit(root, 'B');
    git(root, 'checkout', '-q', '-b', 'feature');
    commit(root, 'C');

    // `branch.<name>.merge` with a `.` remote is a LOCAL upstream — the user stating the baseline.
    git(root, 'config', 'branch.feature.merge', 'refs/heads/main');
    git(root, 'config', 'branch.feature.remote', '.');

    const target = new ChronicleInterface(root).resolveTarget();

    expect(target!.via).toBe('upstream');
    expect(target!.ref).toBe('refs/heads/main');
    expect(target!.commit).toBe(a);          // still the fork point against that upstream
  }, 30000);

  it('REFUSES rather than guessing when there is no other branch to fork from', () => {
    const root = mkRepo('main');
    commit(root, 'A');
    commit(root, 'B');

    // One branch, no upstream. `main` is right there and is exactly what must NOT be returned.
    expect(new ChronicleInterface(root).resolveTarget()).toBeNull();
  }, 30000);

  it('REFUSES when the fork point is ambiguous between two branches', () => {
    // `main` and `develop` on the SAME commit, `feature` off both. Nothing in git says which one
    // was forked from, so picking either would be a guess — and `main` is the guess ADR 0035 names.
    const root = mkRepo('main');
    commit(root, 'A');
    git(root, 'branch', 'develop');
    git(root, 'checkout', '-q', '-b', 'feature');
    commit(root, 'C');

    expect(new ChronicleInterface(root).resolveTarget()).toBeNull();
  }, 30000);

  it('REFUSES on a detached HEAD — no branch means no target', () => {
    const root = mkRepo('main');
    commit(root, 'A');
    git(root, 'checkout', '-q', '-b', 'develop');
    commit(root, 'B');
    const head = git(root, 'rev-parse', 'HEAD');
    git(root, 'checkout', '-q', head);

    expect(new ChronicleInterface(root).resolveTarget()).toBeNull();
  }, 30000);

  it('ignores a branch that already CONTAINS this one — a descendant is not a parent', () => {
    // main(A,B) with `feature` branched at B and never moved. merge-base(feature, main) is
    // feature's own tip, which would otherwise score as the nearest fork point and name `main`.
    const root = mkRepo('main');
    commit(root, 'A');
    git(root, 'checkout', '-q', '-b', 'feature');
    git(root, 'checkout', '-q', 'main');
    commit(root, 'B');
    git(root, 'checkout', '-q', 'feature');

    expect(new ChronicleInterface(root).resolveTarget()).toBeNull();
  }, 30000);
});
