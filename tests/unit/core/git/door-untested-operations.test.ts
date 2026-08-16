import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface, chronicle } from '@/lib/core/git/index.js';

/**
 * The four operations on the git door that no test named (todo69, ADR 0150 rule 10).
 *
 * Found by asking which public operations appear in no test file rather than by reading — three of
 * them look trivial, and one is the pulse's entire read path. `streamBatches` carries the rule that
 * an unreadable file must be DROPPED rather than yielded as empty source: empty source parses fine,
 * gets a unit node with no symbols, and is recorded in the hash gate as successfully analysed, so a
 * permissions error becomes a file that is permanently, silently blank in the graph.
 *
 * `getLastPulsedCommit` / `setLastPulsedCommit` are one round trip over graph metadata and are here
 * because the pair is what the staleness banner reads — a key typo on either side would report every
 * graph as current, which is the reassuring answer.
 */
const tmp: string[] = [];
const mkDir = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-git-ops-'));
  tmp.push(d);
  return d;
};
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const collect = async (gen: AsyncGenerator<Array<{ path: string; source: string }>>) => {
  const out: Array<{ path: string; source: string }> = [];
  for await (const batch of gen) out.push(...batch);
  return out;
};

describe('streamBatches — the pulse read path', () => {
  it('yields every readable file, with its content', async () => {
    const dir = mkDir();
    const a = path.join(dir, 'a.ts');
    const b = path.join(dir, 'b.ts');
    fs.writeFileSync(a, 'export const a = 1;\n');
    fs.writeFileSync(b, 'export const b = 2;\n');
    const git = new ChronicleInterface(dir);

    const read = await collect(git.streamBatches([a, b]));

    expect(read.map(r => r.path).sort()).toEqual([a, b].sort());
    expect(read.find(r => r.path === a)!.source).toBe('export const a = 1;\n');
  });

  it('DROPS an unreadable file rather than yielding it as empty source', async () => {
    // The trap: empty source parses fine, produces a unit node with no symbols, and is recorded in
    // the hash gate as analysed — so the file is silently blank in the graph forever after.
    const dir = mkDir();
    const real = path.join(dir, 'real.ts');
    fs.writeFileSync(real, 'export const x = 1;\n');
    const git = new ChronicleInterface(dir);

    const read = await collect(git.streamBatches([real, path.join(dir, 'does-not-exist.ts')]));

    expect(read.map(r => r.path)).toEqual([real]);
  });

  it('keeps a genuinely EMPTY file, which is not the same as an unreadable one', async () => {
    // The counter-test. A zero-byte file is real content and must survive; only failure is dropped.
    const dir = mkDir();
    const empty = path.join(dir, 'empty.ts');
    fs.writeFileSync(empty, '');
    const git = new ChronicleInterface(dir);

    const read = await collect(git.streamBatches([empty]));

    expect(read).toEqual([{ path: empty, source: '' }]);
  });

  it('respects the batch size rather than reading everything at once', async () => {
    // The reason this is a generator: a large repository must not be held in memory whole.
    const dir = mkDir();
    const files = ['a', 'b', 'c', 'd', 'e'].map(n => {
      const f = path.join(dir, `${n}.ts`);
      fs.writeFileSync(f, `export const ${n} = 1;\n`);
      return f;
    });
    const git = new ChronicleInterface(dir);

    const sizes: number[] = [];
    for await (const batch of git.streamBatches(files, 2)) sizes.push(batch.length);

    expect(sizes).toEqual([2, 2, 1]);
  });

  it('yields nothing for an empty list, rather than one empty batch', async () => {
    const git = new ChronicleInterface(mkDir());
    const batches: unknown[] = [];
    for await (const batch of git.streamBatches([])) batches.push(batch);

    expect(batches).toEqual([]);
  });
});

describe('branchRefusal — the guard the CLI prints', () => {
  const noBranch = () => { throw new Error('not a repository'); };

  it('is silent when the vault names no branch', () => {
    const git = new ChronicleInterface(mkDir(), (() => 'main\n') as never);
    expect(git.branchRefusal(null)).toBeNull();
  });

  it('is silent when the checkout has no branch', () => {
    // A detached HEAD is a legitimate state, not evidence the graph describes the wrong tree.
    const git = new ChronicleInterface(mkDir(), noBranch as never);
    expect(git.branchRefusal('main')).toBeNull();
  });

  it('is silent when both name the same branch', () => {
    const git = new ChronicleInterface(mkDir(), (() => 'main\n') as never);
    expect(git.branchRefusal('main')).toBeNull();
  });

  it('refuses when they differ, and NAMES BOTH branches', () => {
    // Naming only one sends the reader to `analyze` without telling them what happened, and the
    // branch they left is the fact that explains every wrong answer they just got.
    const git = new ChronicleInterface(mkDir(), (() => 'feature/x\n') as never);

    const refusal = git.branchRefusal('main')!;

    expect(refusal).toContain("'main'");
    expect(refusal).toContain("'feature/x'");
    expect(refusal).toContain('--force');
  });
});

describe('the last pulsed commit round trip', () => {
  /** The metadata surface the pair uses, and nothing more. */
  const fakeGraph = () => {
    const store = new Map<string, string>();
    return {
      store,
      getMetadata: (k: string) => store.get(k) ?? null,
      setMetadata: (k: string, v: string) => { store.set(k, v); },
    };
  };

  it('reads back what it wrote', () => {
    const graph = fakeGraph();
    chronicle.setLastPulsedCommit(graph, 'abc123');

    expect(chronicle.getLastPulsedCommit(graph)).toBe('abc123');
  });

  it('answers null for a graph that has never been pulsed', () => {
    // Null is what makes "never analysed" distinguishable from "analysed at some commit". A default
    // hash here would make every fresh graph look current, which is the reassuring answer.
    expect(chronicle.getLastPulsedCommit(fakeGraph())).toBeNull();
  });

  it('writes under the key the staleness check reads', () => {
    // The pair could agree with each other on a typo'd key and still be wrong for every other
    // reader. `conducks-core` reads `lastAnalyzedCommit` off the same metadata.
    const graph = fakeGraph();
    chronicle.setLastPulsedCommit(graph, 'deadbeef');

    expect(graph.store.get('lastAnalyzedCommit')).toBe('deadbeef');
  });
});

describe('the repo-relative path, after the four inline copies were collapsed', () => {
  /**
   * The collapse is only safe if `toRepoRelative` answers identically on the case-insensitive path,
   * which is the case the inline version existed for: on APFS and Windows a file may sit under a
   * root that differs from it only by case, and `path.relative` would then walk out and back with a
   * `../..` chain instead of returning a plain relative path.
   *
   * Asserted through the git ARGUMENTS rather than by calling the private helper, so it pins what
   * the callers actually send.
   */
  const argsFor = async (root: string, file: string): Promise<string[]> => {
    const seen: string[][] = [];
    const git = new ChronicleInterface(root, ((_c: string, args: string[]) => {
      seen.push(args);
      return 'a@x.com\n';
    }) as never);
    await git.getAuthorDistribution(file);
    return seen[0] ?? [];
  };

  it('passes a plain relative path when the root case matches', async () => {
    const dir = mkDir();
    const args = await argsFor(dir, path.join(dir, 'src', 'File.ts'));

    expect(args[args.length - 1]).toBe(path.join('src', 'File.ts'));
  });

  it('passes the SAME path when the root differs only by case', async () => {
    // Without the case-insensitive branch this returns a `../..` chain, and git is asked about a
    // path outside the repository — which answers nothing and looks like a file with no history.
    const dir = mkDir();
    const shouted = dir.toUpperCase();
    const args = await argsFor(dir, path.join(shouted, 'src', 'File.ts'));

    expect(args[args.length - 1]).not.toContain('..');
    expect(args[args.length - 1].toLowerCase()).toBe(path.join('src', 'file.ts'));
  });
});
