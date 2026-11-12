import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Finding nothing must never delete or create anything (state-machine audit, 2026-11-12).
 *
 * P-06-3: the reconcile — purge every unit discovery no longer returns — ran BEFORE the "no analyzable
 * source files" check. When discovery returns nothing at all (a wrong path, or an ignore file that
 * matches everything, itself included) that is every unit in the vault: the run purged the vault and
 * only then reported failure.
 *
 * P-08-6: an analyze that found nothing still created `.conducks/conducks-synapse.db`, which `list`,
 * `setup` and `doctor` read as an analyzed project.
 */
const repos: string[] = [];
afterEach(() => { while (repos.length) rmRepo(repos.pop()!); });

describe('an analyze that finds nothing', () => {
  it('fails without purging what the vault already holds', async () => {
    ensureBuild();
    const repo = mkGitRepo('empty-discovery');
    repos.push(repo);
    writeFile(repo, 'src/a.ts', 'export function keep() { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    writeFile(repo, '.conducksignore', '*\n**/*\n');
    const res = runCli(['analyze', '--yes'], { cwd: repo, allowFail: true });

    expect(res.status).not.toBe(0);
    const vault = new SynapsePersistence(repo, true);
    const rows = await vault.query("SELECT name FROM nodes WHERE file LIKE '%/src/a.ts' AND name = 'keep'");
    await vault.close();
    expect(rows.length).toBe(1);
  }, 180000);

  it('fails without creating a vault', () => {
    ensureBuild();
    const repo = mkGitRepo('empty-nothing');
    repos.push(repo);
    writeFile(repo, 'README.md', '# nothing to analyze\n');
    commit(repo, 'init');
    writeFile(repo, '.conducksignore', '*\n**/*\n');

    const res = runCli(['analyze', '--yes'], { cwd: repo, allowFail: true });

    expect(res.status).not.toBe(0);
    expect(fs.existsSync(path.join(repo, '.conducks', 'conducks-synapse.db'))).toBe(false);
  }, 180000);
});
