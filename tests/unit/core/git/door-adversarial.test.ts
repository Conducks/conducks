import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/index.js';

/**
 * The cases the git door is asked to survive, and had no test for (todo69#P3).
 *
 * The existing suites cover the happy paths and several failure paths well — nested repositories, a
 * directory with no git, a ref that does not resolve, null-not-zero for commits behind. What none of
 * them exercised is git being ABSENT or HOSTILE rather than merely unhelpful: no binary at all, a
 * bare repository, a branch name carrying a slash, a path outside the anchor, a filename that is not
 * ASCII.
 *
 * Driven through the injected `execFile` seam wherever the case is about git's RESPONSE, and through
 * a real temporary directory wherever it is about the filesystem. Building a bare repository or a
 * broken git installation as a fixture would test git, not this file.
 *
 * Every case here was checked against a deliberately broken version of the code it covers. A test
 * that passes either way is not kept (ADR 0150 rule 10).
 */
const tmp: string[] = [];
const mkDir = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-git-adv-'));
  tmp.push(d);
  return d;
};
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

/** A git that is not installed: `execFileSync` throws ENOENT before any repository is consulted. */
const noGitBinary = () => { const e: NodeJS.ErrnoException = new Error('spawnSync git ENOENT'); e.code = 'ENOENT'; throw e; };

/** A git that answers, with whatever the case needs. */
const gitSaying = (answer: string | ((args: string[]) => string)) =>
  ((_cmd: string, args: string[]) => (typeof answer === 'function' ? answer(args) : answer)) as never;

describe('the git door when git is absent', () => {
  it('reports not-a-repository rather than throwing', () => {
    const git = new ChronicleInterface(mkDir(), noGitBinary as never);
    expect(git.isRepository()).toBe(false);
  });

  it('returns null for the branch, which is not the same as a branch named nothing', () => {
    const git = new ChronicleInterface(mkDir(), noGitBinary as never);
    expect(git.getCurrentBranch()).toBeNull();
  });

  it('returns null commits-behind, never 0', () => {
    // 0 also means "you are current", and it is the value that silences the staleness banner — so
    // the one case where a reader most needs telling would produce the reassuring output.
    const git = new ChronicleInterface(mkDir(), noGitBinary as never);
    expect(git.getCommitsBehind('abc123')).toBeNull();
  });

  it('returns null for HEAD rather than an empty string', () => {
    const git = new ChronicleInterface(mkDir(), noGitBinary as never);
    expect(git.getHeadHash()).toBeNull();
  });

  it('refuses a target instead of assuming main', () => {
    const git = new ChronicleInterface(mkDir(), noGitBinary as never);
    expect(git.resolveTarget()).toBeNull();
  });

  it('still discovers files, by falling back to the filesystem', async () => {
    // ADR 0035: a project with no repository is a supported input. Discovery must still answer.
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');
    const git = new ChronicleInterface(dir, noGitBinary as never);

    expect(await git.discoverFiles()).toEqual([path.join(dir, 'a.ts')]);
  });
});

describe('the git door on hostile or unusual answers', () => {
  it('refuses a HEAD that is not a commit hash', () => {
    // `resolveRef` verifies the SHAPE of what git returned. A plausible-looking non-hash is the
    // failure mode that would otherwise be diffed against.
    const git = new ChronicleInterface(mkDir(), gitSaying('not-a-hash\n'));
    expect(git.resolveRef('HEAD')).toBeNull();
  });

  it('accepts a branch name containing a slash', () => {
    // `feature/x` is ordinary and contains the separator every path in this file also uses.
    const git = new ChronicleInterface(mkDir(), gitSaying('feature/deep/name\n'));
    expect(git.getCurrentBranch()).toBe('feature/deep/name');
  });

  it('treats an empty branch answer as no branch', () => {
    // A bare repository and a detached HEAD both answer emptily; neither is a branch called ''.
    const git = new ChronicleInterface(mkDir(), gitSaying('\n'));
    expect(git.getCurrentBranch()).toBeNull();
  });

  it('passes core.quotePath=false on every listing, so a non-ASCII path survives', async () => {
    // Without it git returns `"data/\304\260stanbul.csv"` — quotes and octal escapes included — which
    // resolves to a path that opens nothing, and the file is silently absent from every answer.
    const seen: string[][] = [];
    const git = new ChronicleInterface(mkDir(), ((_c: string, args: string[]) => {
      seen.push(args);
      return args.includes('ls-files') ? 'İstanbul.ts\n' : '';
    }) as never);

    await git.discoverFiles();

    const listings = seen.filter(a => a.includes('ls-files'));
    expect(listings.length).toBeGreaterThan(0);
    for (const args of listings) expect(args.slice(0, 2)).toEqual(['-c', 'core.quotePath=false']);
  });

  it('does not spawn git for a file outside the anchor', async () => {
    // The containment check runs BEFORE git, so a path from another project cannot be read through
    // this instance — and the null says "not available", not "no history".
    let spawned = 0;
    const git = new ChronicleInterface(mkDir(), (() => { spawned++; return ''; }) as never);

    expect(await git.getFileHistory('/somewhere/else/x.ts')).toBeNull();
    expect(spawned).toBe(0);
  });
});

describe('the git door on discovery edges', () => {
  it('drops a binary file rather than reading it as text', async () => {
    const dir = mkDir();
    const git = new ChronicleInterface(dir, gitSaying((args) =>
      args.includes('ls-files') ? 'logo.png\nmain.ts\n' : ''));

    const found = await git.discoverFiles();

    expect(found.map(f => path.basename(f))).toEqual(['main.ts']);
  });

  it('keeps an unknown extension, because the list is a denylist', async () => {
    // A language added later must not be silently skipped — the failure direction is deliberate.
    const dir = mkDir();
    const git = new ChronicleInterface(dir, gitSaying((args) =>
      args.includes('ls-files') ? 'thing.zig\n' : ''));

    expect((await git.discoverFiles()).map(f => path.basename(f))).toEqual(['thing.zig']);
  });

  it('reads a file whose name is not ASCII', async () => {
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, 'İstanbul.ts'), 'export const x = 1;\n');
    const git = new ChronicleInterface(dir, noGitBinary as never);

    expect((await git.discoverFiles()).map(f => path.basename(f))).toEqual(['İstanbul.ts']);
  });
});
