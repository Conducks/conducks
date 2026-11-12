import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A file deleted from disk and not yet committed is GONE for `analyze` (deep test 2026-11-12).
 *
 * MEASURED before the fix: analyze, `rm src/b.ts` (no `git rm`, no commit), analyze again — "No
 * changes detected. Structural Synapse is already at 100% resonance", and `query gone` still found
 * the deleted function. Discovery lists `git ls-files --cached`, which keeps a deleted file until the
 * deletion is staged, so the reconcile never saw it vanish and its rows stayed for good.
 */
async function names(repo: string): Promise<string[]> {
  const vault = new SynapsePersistence(repo, true);
  try {
    return (await vault.query("SELECT name FROM nodes WHERE canonicalKind = 'BEHAVIOR' AND id NOT LIKE 'taxonomy::%' ORDER BY name")).map((r: any) => r.name);
  } finally { await vault.close(); }
}

describe('analyze after deleting a file without committing', () => {
  let repo: string;
  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('analyze-deleted-uncommitted');
    writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\n');
    writeFile(repo, 'src/b.ts', 'export function gone() { return 2; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterEach(() => rmRepo(repo));

  it('removes its symbols', async () => {
    expect(await names(repo)).toEqual(['foo', 'gone']);
    fs.rmSync(path.join(repo, 'src/b.ts'));
    runCli(['analyze', '--yes'], { cwd: repo });
    expect(await names(repo)).toEqual(['foo']);
  }, 180000);
});
