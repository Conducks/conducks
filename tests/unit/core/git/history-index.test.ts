/**
 * todo82#P1 — one repo-wide `git log` must give every file the same history as its own
 * `git log -- <file>`. The two cases a plain `--name-only` log gets wrong are planted here: a merge
 * that edits a file against both parents (missed without `--diff-merges=combined`) and a rename
 * (the old path loses the commit that moved it away without `--no-renames`).
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

let root = '';
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

const git = (who: string, ...args: string[]) =>
  execFileSync('git', ['-c', `user.email=${who}@t`, '-c', `user.name=${who}`, ...args], { cwd: root, stdio: 'pipe' });
const write = (file: string, body: string) => fs.writeFileSync(path.join(root, file), body);

describe('repo-wide history index (todo82#P1)', () => {
  it('matches the per-file git log for merged, renamed and plain files', async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-hist-')));
    git('a', 'init', '-q', '-b', 'main', '.');
    write('f.ts', 'one\n'); write('old.ts', 'x\n'); git('a', 'add', '-A'); git('a', 'commit', '-qm', 'c1');
    git('a', 'checkout', '-qb', 'side'); write('f.ts', 'side\n'); git('b', 'commit', '-qam', 'side');
    git('a', 'checkout', '-q', 'main'); write('g.ts', 'g\n'); git('a', 'add', '-A'); git('a', 'commit', '-qm', 'g');
    git('c', 'merge', '-q', '--no-commit', 'side');
    write('f.ts', 'resolved by hand\n'); git('c', 'add', '-A'); git('c', 'commit', '-qm', 'merge');
    git('a', 'mv', 'old.ts', 'new.ts'); git('d', 'commit', '-qm', 'rename');

    const ch = new ChronicleInterface(root);
    const files = ['f.ts', 'g.ts', 'old.ts', 'new.ts'].map(f => path.join(root, f));
    const perFile = await Promise.all(files.map(f => ch.getFileHistory(f)));

    ch.primeHistory(ch.buildHistoryIndex());
    const indexed = await Promise.all(files.map(f => ch.getFileHistory(f)));

    expect(perFile[0]!.distribution).toEqual({ 'a@t': 1, 'b@t': 1, 'c@t': 1 }); // the planted merge counts
    expect(perFile[2]!.distribution).toEqual({ 'a@t': 1, 'd@t': 1 }); // the rename counts for the old path
    expect(indexed).toEqual(perFile);
  });

  it("indexes the project's own repo when it sits inside another repo", () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-hist-')));
    git('outer', 'init', '-q', '.'); write('outer.ts', 'o\n'); git('outer', 'add', '-A'); git('outer', 'commit', '-qm', 'outer');
    const inner = path.join(root, 'inner');
    fs.mkdirSync(inner);
    fs.writeFileSync(path.join(inner, 'f.ts'), 'f\n');
    const ig = (...a: string[]) => execFileSync('git', ['-c', 'user.email=in@t', '-c', 'user.name=in', ...a], { cwd: inner, stdio: 'pipe' });
    ig('init', '-q', '.'); ig('add', '-A'); ig('commit', '-qm', 'inner');

    const entries = new ChronicleInterface(inner).buildHistoryIndex();

    expect(Object.keys(entries)).toEqual([path.join(inner, 'f.ts')]);
  });
});

describe('blame cache (todo82#P2)', () => {
  const setup = () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-blame-')));
    git('a', 'init', '-q', '.'); write('f.ts', 'one\ntwo\n'); git('a', 'add', '-A'); git('a', 'commit', '-qm', 'c1');
    const ch = new ChronicleInterface(root);
    ch.primeHistory(ch.buildHistoryIndex());
    return ch;
  };
  const cacheDir = () => path.join(root, '.conducks', 'blame-cache');
  const cached = () => fs.existsSync(cacheDir()) ? fs.readdirSync(cacheDir()) : [];

  it('answers a second blame from the cache, with the same result', async () => {
    const ch = setup();
    const fresh = await ch.getBlameData(path.join(root, 'f.ts'));
    expect(cached()).toHaveLength(1);
    const entry = path.join(cacheDir(), cached()[0]);
    expect(JSON.parse(fs.readFileSync(entry, 'utf-8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
    fs.writeFileSync(entry, JSON.stringify({ 1: { author: 'from-cache', timestamp: 1 } }));
    expect((await ch.getBlameData(path.join(root, 'f.ts')))[1].author).toBe('from-cache');
  });

  it('blames an edited file fresh and does not store it', async () => {
    const ch = setup();
    await ch.getBlameData(path.join(root, 'f.ts'));
    write('f.ts', 'one\nchanged\n');
    const dirty = await ch.getBlameData(path.join(root, 'f.ts'));
    expect(dirty[2].author).toBe('not.committed.yet'); // a key without the content would return the clean entry
    expect(cached()).toHaveLength(1);
  });
});
