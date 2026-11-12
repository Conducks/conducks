import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A pulse that fails keeps the previous good graph — ALL of it, including the units its reconcile
 * would have purged (state-machine audit round 2, Q-06-7).
 *
 * The reconcile purge of vanished units committed on its own, before `beginPulse`. A pulse that then
 * failed rolled back its own writes but not that purge: the vault was neither the old graph nor the
 * new one. The failure here is real: a PATH with `git` and no `node`, so every parse worker fails to
 * start and the pulse aborts after the reconcile ran.
 */
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

async function names(repo: string, file: string): Promise<string[]> {
  const vault = new SynapsePersistence(repo, true);
  try {
    return (await vault.query<{ name: string }>(`SELECT name FROM nodes WHERE file LIKE '%/${file}' ORDER BY name`)).map(r => r.name);
  } finally { await vault.close(); }
}

describe('reconcile and the pulse are one transaction', () => {
  let repo: string;
  let bin: string;
  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('reconcile-in-pulse');
    writeFile(repo, 'src/gone.ts', 'export function doomed() { return 1; }\n');
    writeFile(repo, 'src/b.ts', 'export function bee() { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-gitonly-bin-'));
    fs.symlinkSync(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'));
  });
  afterEach(() => { rmRepo(repo); fs.rmSync(bin, { recursive: true, force: true }); });

  it('a pulse that fails after the reconcile leaves the vanished unit in the vault', async () => {
    expect(await names(repo, 'src/gone.ts')).toContain('doomed');

    execFileSync('git', ['rm', '-q', 'src/gone.ts'], { cwd: repo });
    writeFile(repo, 'src/b.ts', 'export function bee() { return 2; }\n');
    const res = spawnSync(process.execPath, [CLI, 'analyze', '--yes'], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: bin, CONDUCKS_WORKERS: '2' },
    });
    const log = (res.stdout ?? '') + (res.stderr ?? '');

    expect(log).toMatch(/Reconciling: purging 1 unit/);
    expect(log).toMatch(/failed to start/);
    expect(res.status).not.toBe(0);
    expect(await names(repo, 'src/gone.ts')).toContain('doomed');
    expect(await names(repo, 'src/b.ts')).toContain('bee');
  }, 180000);

  it('with nothing else changed, a vanished unit is still purged', async () => {
    execFileSync('git', ['rm', '-q', 'src/gone.ts'], { cwd: repo });
    runCli(['analyze', '--yes'], { cwd: repo });
    expect(await names(repo, 'src/gone.ts')).toEqual([]);
    expect(await names(repo, 'src/b.ts')).toContain('bee');
  }, 180000);
});
