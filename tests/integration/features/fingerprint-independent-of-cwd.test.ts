import { describe, it, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A symbol's fingerprint must not depend on the directory `analyze` was started from (state-machine
 * audit P-03-3 / P-04-5).
 *
 * The fingerprint hashes the file's PROJECT-RELATIVE path, and the project root is read from the
 * process anchor. The main thread anchors to the analysed root; the parse workers never did — each
 * built its own anchor from `CONDUCKS_WORKSPACE_ROOT || process.cwd()`. MEASURED: `analyze <repo>`
 * run from another directory gave every symbol a different fingerprint than `analyze` run inside
 * it, which breaks the "same fingerprint, different id" move detection across machines and runs.
 *
 * (Imports were NOT affected, which is why the audit's first measurement saw nothing: workers emit
 * import specifiers raw and the main thread resolves them against its own, correct anchor.)
 */
describe('fingerprints do not depend on the working directory', () => {
  const repo = mkGitRepo('fp-cwd');
  afterAll(() => rmRepo(repo));

  const fingerprints = async () => {
    const vault = new SynapsePersistence(repo, true);
    const rows = await vault.query<{ id: string; fingerprint: string }>(
      "SELECT id, fingerprint FROM nodes WHERE file LIKE '%.ts' AND canonicalKind <> 'UNIT' ORDER BY id");
    await vault.close();
    return rows;
  };

  it('is the same from inside the repo and from an unrelated directory', async () => {
    ensureBuild();
    writeFile(repo, 'main.ts', 'export function top() { return 1; }\n');
    writeFile(repo, 'src/b.ts', 'export function deep() { return 2; }\n');
    commit(repo, 'init');

    runCli(['analyze', '--yes'], { cwd: repo });
    const inside = await fingerprints();
    fs.rmSync(path.join(repo, '.conducks'), { recursive: true, force: true });
    runCli(['analyze', repo, '--yes'], { cwd: process.cwd() });
    const outside = await fingerprints();

    expect(inside.length).toBe(2);
    expect(outside).toEqual(inside);
  }, 240000);
});
