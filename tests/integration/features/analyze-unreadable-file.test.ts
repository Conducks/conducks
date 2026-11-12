import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A changed file that cannot be READ must keep its rows, and must be re-read once it can be
 * (state-machine audit round 2, found by area E while fixing Q-06-7).
 *
 * MEASURED before the fix: analyze, edit `src/b.ts`, `chmod 000` it, analyze again. The run logged
 * "Skipped 1 unreadable file(s)", reflected 0 units and exited 0 — and every row of `b.ts` was gone:
 * the purge took every DIRTY file, the reader then dropped the one it could not read, and nothing
 * wrote it back. Its hash stayed recorded and its mtime was older than the new pulse, so no later
 * `analyze` would ever look at it again.
 */
async function names(repo: string): Promise<string[]> {
  const vault = new SynapsePersistence(repo, true);
  try {
    return (await vault.query("SELECT name FROM nodes WHERE file LIKE '%/src/b.ts' AND canonicalKind <> 'UNIT' ORDER BY name")).map((r: any) => r.name);
  } finally { await vault.close(); }
}

const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe('analyze and a file it cannot read', () => {
  let repo: string;
  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('analyze-unreadable');
    writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\n');
    writeFile(repo, 'src/b.ts', 'export function bar() { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterEach(() => {
    try { fs.chmodSync(path.join(repo, 'src/b.ts'), 0o644); } catch { /* already restored */ }
    rmRepo(repo);
  });

  (runningAsRoot ? it.skip : it)('keeps its rows, and the next analyze reads it once it is readable', async () => {
    expect(await names(repo)).toEqual(['bar']);

    await new Promise(r => setTimeout(r, 1100));
    writeFile(repo, 'src/b.ts', 'export function baz() { return 2; }\n');
    fs.chmodSync(path.join(repo, 'src/b.ts'), 0o000);
    runCli(['analyze', '--yes'], { cwd: repo, allowFail: true });
    fs.chmodSync(path.join(repo, 'src/b.ts'), 0o644);
    expect(await names(repo)).toEqual(['bar']);

    runCli(['analyze', '--yes'], { cwd: repo });
    expect(await names(repo)).toEqual(['baz']);
  }, 180000);

  (runningAsRoot ? it.skip : it)('a full pass (--force) that cannot read a file does not sweep its rows away', async () => {
    fs.chmodSync(path.join(repo, 'src/b.ts'), 0o000);
    runCli(['analyze', '--force', '--yes'], { cwd: repo, allowFail: true });
    fs.chmodSync(path.join(repo, 'src/b.ts'), 0o644);
    expect(await names(repo)).toEqual(['bar']);
  }, 180000);
});
