import { describe, it, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RegistryBootstrapper } from '@/lib/core/registry-bootstrapper.js';

/**
 * ADR 0039's worktree half, which was CURRENT BEHAVIOUR that nothing pinned (todo21#P0).
 *
 * "A vault describes the tree beside it, so a linked worktree gets its own, and that is correct
 * rather than tolerated." A shared per-repository vault was rejected because it moves DuckDB's
 * exclusive file lock from per-tree to per-repository, which is the opposite of why worktrees exist:
 * two checkouts you can work in at once.
 *
 * Nothing asserted it. The behaviour rests on one detail — `discoverRoot()` tests
 * `existsSync(<dir>/.git)`, and in a LINKED worktree `.git` is a FILE containing a `gitdir:` pointer
 * rather than a directory. Anything that tightened that check to "is a directory" would silently
 * make both worktrees resolve to the main checkout and share one vault, and the symptom would be a
 * lock conflict in an unrelated command rather than anything naming worktrees.
 */

/**
 * `discoverRoot()` uses `path.resolve`, NOT `realpath`, so the expectations here must too. On macOS
 * `os.tmpdir()` is `/var/folders/…`, a symlink to `/private/var/folders/…`, and comparing against a
 * realpath'd fixture fails on the symlink rather than on the behaviour.
 *
 * Worth naming as a real if narrow consequence: two paths that reach the same directory through a
 * symlink anchor as two different roots and therefore get two vaults. Not fixed here — canonicalising
 * the anchor is a change with its own blast radius — but it is now written down rather than folded
 * into a test helper.
 */
const dirs: string[] = [];
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

afterAll(() => {
  for (const d of dirs.reverse()) fs.rmSync(d, { recursive: true, force: true });
});

/** A real repository with one commit, plus two linked worktrees of it. */
function repoWithWorktrees(): { main: string; wtA: string; wtB: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-wt-'));
  dirs.push(base);
  const main = path.join(base, 'main');
  fs.mkdirSync(main);

  git(main, 'init', '-q', '-b', 'trunk');
  git(main, 'config', 'user.email', 'test@example.com');
  git(main, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(main, 'package.json'), '{"name":"wt-fixture"}');
  fs.writeFileSync(path.join(main, 'a.ts'), 'export const a = 1;\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'first');

  const wtA = path.join(base, 'wt-a');
  const wtB = path.join(base, 'wt-b');
  git(main, 'worktree', 'add', '-q', '-b', 'feature-a', wtA);
  git(main, 'worktree', 'add', '-q', '-b', 'feature-b', wtB);
  return { main, wtA, wtB };
}

/**
 * A worktree of a repo carrying NO other project marker, with the source one level down.
 *
 * The `.git` FILE has to be the only thing that can anchor here. The first version of this fixture
 * committed a `package.json`, so `hasMarker` short-circuited and the `.git` branch was never
 * reached — tightening it to "is a directory" left the tests green. Found by mutation, which is the
 * only way a vacuous test announces itself.
 */
function markerFreeWorktree(): { wt: string; srcDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-wtbare-'));
  dirs.push(base);
  const main = path.join(base, 'main');
  fs.mkdirSync(path.join(main, 'src'), { recursive: true });
  git(main, 'init', '-q', '-b', 'trunk');
  git(main, 'config', 'user.email', 'test@example.com');
  git(main, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(main, 'src', 'a.ts'), 'export const a = 1;\n');   // no manifest anywhere
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'first');
  const wt = path.join(base, 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'feature', wt);
  return { wt, srcDir: path.join(wt, 'src') };
}

describe('ADR 0039 — a linked worktree gets its own vault', () => {
  it('anchors each worktree at ITSELF, not at the main checkout', () => {
    const { main, wtA, wtB } = repoWithWorktrees();
    const b = new RegistryBootstrapper();

    expect(b.discoverRoot(wtA)).toBe(path.resolve(wtA));
    expect(b.discoverRoot(wtB)).toBe(path.resolve(wtB));
    expect(b.discoverRoot(main)).toBe(path.resolve(main));

    // The property that matters: three checkouts, three distinct anchors, so three vaults.
    const anchors = new Set([b.discoverRoot(main), b.discoverRoot(wtA), b.discoverRoot(wtB)]);
    expect(anchors.size).toBe(3);
  });

  /**
   * The detail the behaviour rests on, asserted directly so a future "is it a directory?" tightening
   * fails here with a message that names worktrees, rather than surfacing as a DuckDB lock conflict
   * in an unrelated command.
   */
  it('treats a worktree\'s `.git` FILE as a repository marker, not only a directory', () => {
    const { wt, srcDir } = markerFreeWorktree();
    const dotGit = path.join(wt, '.git');
    expect(fs.statSync(dotGit).isFile()).toBe(true);                 // a pointer, not a directory
    expect(fs.readFileSync(dotGit, 'utf8')).toMatch(/^gitdir:/);
    // No manifest anywhere in the tree, so the `.git` FILE is the ONLY thing that can anchor here.
    // Starting one level down forces the walk to climb and land on it.
    expect(fs.existsSync(path.join(wt, 'package.json'))).toBe(false);
    expect(new RegistryBootstrapper().discoverRoot(srcDir)).toBe(path.resolve(wt));
  });

  /**
   * A worktree of a DECLARED workspace still resolves to the worktree. ADR 0069 made a
   * `conducks.json` beat the marker walk, and that rule must not reach across into a sibling
   * checkout — each worktree carries its own copy of the declaration, so nearest-wins lands at home.
   */
  it('keeps each worktree separate when the repository declares a workspace', () => {
    const { main, wtA } = repoWithWorktrees();
    fs.writeFileSync(path.join(main, 'conducks.json'), '{"services":["."]}');
    fs.writeFileSync(path.join(wtA, 'conducks.json'), '{"services":["."]}');

    const b = new RegistryBootstrapper();
    expect(b.discoverRoot(wtA)).toBe(path.resolve(wtA));
    expect(b.discoverRoot(main)).toBe(path.resolve(main));
    expect(b.discoverRoot(wtA)).not.toBe(b.discoverRoot(main));
  });
});
