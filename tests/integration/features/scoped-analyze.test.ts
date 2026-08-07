import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A SCOPED analyze re-parses its scope and leaves everything else ALONE — including the freshness
 * of files it did not touch.
 *
 * `conducks analyze src/inside` filters the dirty set to the scope, which is right: a subfolder
 * pulse must not delete or rewrite the rest of the vault. What it must ALSO not do is mark the
 * out-of-scope dirty files as processed — and it did. Their content hashes were re-stamped for the
 * whole discovered set rather than for the set actually analyzed, so the next full `analyze`
 * answered "No changes detected. Structural Synapse is already at 100% resonance" over files whose
 * symbols were never re-read. The stale definitions then live in the graph until someone happens to
 * run `--force`, and nothing anywhere says so.
 *
 * The second half of this test is the one that fails without the fix: it is not enough that the
 * scoped run skipped the file, it has to still be WAITING for the next run.
 */
describe('scoped analyze', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('scoped');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'scoped', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/inside/a.ts', 'export function insideOne(): number { return 1; }\n');
    writeFile(repo, 'src/outside/b.ts', 'export function outsideOne(): number { return 1; }\n');
    commit(repo, 'two folders');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  /**
   * Read the graph THROUGH THE CLI, never with an in-process vault handle. A DuckDB reader holds a
   * lock a subsequent `analyze` cannot take, so a test that opens the vault between two CLI runs
   * fails on the lock and reads as a broken feature — which is exactly how this test first failed.
   */
  const names = (): string[] => {
    const out = runCli(['query', '*', '--limit', '50', '--json'], { cwd: repo }).stdout;
    const found = ['insideone', 'insidetwo', 'outsideone', 'outsidetwo']
      .filter(n => new RegExp(`"name"\\s*:\\s*"${n}"`, 'i').test(out));
    return found.sort();
  };

  it('re-parses its scope and does NOT parse outside it', () => {
    expect(names()).toEqual(['insideone', 'outsideone']);

    writeFile(repo, 'src/inside/a.ts', 'export function insideOne(): number { return 1; }\nexport function insideTwo(): number { return 2; }\n');
    writeFile(repo, 'src/outside/b.ts', 'export function outsideOne(): number { return 1; }\nexport function outsideTwo(): number { return 2; }\n');

    runCli(['analyze', 'src/inside', '--yes'], { cwd: repo });

    const after = names();
    expect(after).toContain('insidetwo');      // the scope was re-parsed
    expect(after).not.toContain('outsidetwo'); // and nothing outside it was
  });

  it('leaves the out-of-scope change WAITING, so the next full run picks it up', () => {
    // Without this, a scoped pulse silently marks the whole repository fresh: the next analyze says
    // "no changes" and the stale symbols stay until someone runs --force for unrelated reasons.
    runCli(['analyze', '--yes'], { cwd: repo });

    expect(names()).toContain('outsidetwo');
  });
});
