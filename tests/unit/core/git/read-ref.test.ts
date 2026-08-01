import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

/**
 * Reading a ref WITHOUT checking it out (ADR 0035, todo20#P3) — the operation a commit-keyed layer
 * is built from.
 *
 * Measured on this repository's 551 files before it was written: `git archive` 53 ms,
 * `cat-file --batch` 117 ms, `git show` per file 5,655 ms. Against a ~5 s pulse the first two are
 * about 1% and the third is 107x worse — pure process spawn. `cat-file --batch` won on ergonomics,
 * handing back `(path, content)` where `archive` returns a tar stream needing its own parser.
 *
 * Real repositories, not mocks: the whole behaviour under test is what git prints, and a mock would
 * assert the mock. The awkward cases below — a path with a space, a file whose content contains a
 * line that LOOKS like a `cat-file` header — are the ones a naive parser gets wrong.
 */
const dirs: string[] = [];
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let repo: string;
let firstCommit: string;

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-readref-'));
  dirs.push(repo);
  git(repo, 'init', '-q', '-b', 'trunk');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');

  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(repo, 'gone.ts'), 'export const gone = true;\n');
  fs.writeFileSync(path.join(repo, 'with space.ts'), 'export const spaced = 1;\n');
  // A file whose CONTENT contains something shaped like a `cat-file --batch` header. A parser that
  // scans for the next header instead of honouring the declared byte length truncates here.
  fs.writeFileSync(path.join(repo, 'tricky.ts'),
    'const s = `\n0000000000000000000000000000000000000000 blob 999\nstill mine\n`;\n');
  fs.writeFileSync(path.join(repo, 'empty.ts'), '');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'first');
  firstCommit = git(repo, 'rev-parse', 'HEAD').trim();

  // Second commit: change one file, delete another, add a third.
  fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 2;\n');
  fs.rmSync(path.join(repo, 'gone.ts'));
  fs.writeFileSync(path.join(repo, 'added.ts'), 'export const added = 1;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'second');
});

afterAll(() => { for (const d of dirs.reverse()) fs.rmSync(d, { recursive: true, force: true }); });

const chronicleAt = (dir: string) => {
  const c = new ChronicleInterface();
  c.setProjectDir(dir);
  return c;
};

describe('resolveRef', () => {
  it('resolves a branch name to a full commit hash', () => {
    expect(chronicleAt(repo).resolveRef('trunk')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('resolves HEAD~1 to the first commit', () => {
    expect(chronicleAt(repo).resolveRef('HEAD~1')).toBe(firstCommit);
  });

  /** A ref that does not resolve is the case ADR 0035 refuses to guess on — null, never a fallback. */
  it('returns null for a ref that does not exist', () => {
    expect(chronicleAt(repo).resolveRef('no-such-branch')).toBeNull();
  });

  it('returns null outside a repository rather than throwing', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-norepo-'));
    dirs.push(bare);
    expect(chronicleAt(bare).resolveRef('HEAD')).toBeNull();
  });

  /**
   * The malformed-response path, reachable only through the injected runner.
   *
   * `rev-parse --verify <ref>^{commit}` throws on a bad ref, so the catch covers every case a real
   * git produces and the hash check LOOKS untestable — a mutation replacing it with a fallback
   * stayed green. It is not untestable, it just needs the seam the constructor already provides:
   * a runner that exits 0 and prints something that is not a hash. Without the check, that becomes
   * a layer key, and a layer built under a garbage commit id is worse than no layer at all.
   */
  it('refuses a successful response that is not a commit hash', () => {
    const liar = (() => 'ref: refs/heads/trunk\n') as unknown as typeof execFileSync;
    expect(new ChronicleInterface(repo, liar).resolveRef('trunk')).toBeNull();
  });

  it('refuses an empty successful response', () => {
    const silent = (() => '\n') as unknown as typeof execFileSync;
    expect(new ChronicleInterface(repo, silent).resolveRef('trunk')).toBeNull();
  });
});

describe('readRef reads a commit without checking it out', () => {
  it('returns the ref\'s files, not the working tree\'s', async () => {
    const c = chronicleAt(repo);
    const older = await c.readRef('HEAD~1');
    expect(older).not.toBeNull();

    // The working tree is at HEAD: a.ts says 2, gone.ts is deleted, added.ts exists.
    expect(fs.readFileSync(path.join(repo, 'src', 'a.ts'), 'utf8')).toContain('a = 2');
    // ...and the ref still says 1, still has gone.ts, and has never heard of added.ts.
    expect(older!.get('src/a.ts')).toBe('export const a = 1;\n');
    expect(older!.get('gone.ts')).toBe('export const gone = true;\n');
    expect(older!.has('added.ts')).toBe(false);
  });

  it('reads the current commit too', async () => {
    const now = await chronicleAt(repo).readRef('HEAD');
    expect(now!.get('src/a.ts')).toBe('export const a = 2;\n');
    expect(now!.has('gone.ts')).toBe(false);
    expect(now!.get('added.ts')).toBe('export const added = 1;\n');
  });

  /**
   * The parser's real hazard. `cat-file --batch` emits `<oid> <type> <size>` then exactly <size>
   * bytes — so the SIZE delimits content. Scanning for the next header-looking line truncates any
   * file that contains one, and this fixture contains one on purpose.
   */
  it('does not truncate a file whose content looks like a batch header', async () => {
    const got = (await chronicleAt(repo).readRef('HEAD'))!.get('tricky.ts');
    expect(got).toContain('still mine');
    expect(got).toBe(fs.readFileSync(path.join(repo, 'tricky.ts'), 'utf8'));
  });

  it('handles a path containing a space', async () => {
    expect((await chronicleAt(repo).readRef('HEAD'))!.get('with space.ts'))
      .toBe('export const spaced = 1;\n');
  });

  /** An empty file is a real file with empty content, not a missing one — the distinction ADR 0049 draws. */
  it('returns an empty file as present-and-empty, not absent', async () => {
    const files = (await chronicleAt(repo).readRef('HEAD'))!;
    expect(files.has('empty.ts')).toBe(true);
    expect(files.get('empty.ts')).toBe('');
  });

  it('returns null for a ref that does not resolve', async () => {
    expect(await chronicleAt(repo).readRef('no-such-branch')).toBeNull();
  });

  it('returns null outside a repository', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-norepo2-'));
    dirs.push(bare);
    expect(await chronicleAt(bare).readRef('HEAD')).toBeNull();
  });

  it('reads every tracked file exactly once', async () => {
    const files = (await chronicleAt(repo).readRef('HEAD'))!;
    const tracked = git(repo, 'ls-tree', '-r', '--name-only', 'HEAD').trim().split('\n').sort();
    expect([...files.keys()].sort()).toEqual(tracked);
  });
});
