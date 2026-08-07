import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * A file whose PATH contains a non-ASCII character is analyzed like any other.
 *
 * `git ls-files` quotes such paths by default (`core.quotePath`): `café.py` comes back as the
 * literal `"caf\303\251.py"`, quotes and octal escapes included. Conducks took that string as a
 * path, opened nothing, and dropped the file — reported as "skipped 1 unreadable file", which is
 * the honest half of a wrong answer. Found by running `analyze` on the frozen Python subject, which
 * owns one such file; there it is a CSV, so the loss was a single container node. In a repository
 * that names source files in Turkish, French or Chinese it is every symbol in them, absent from
 * every answer, with a warning nobody reads as "your code is missing".
 */
describe('non-ASCII file paths are analyzed, not skipped', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('nonascii');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'na', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/café.ts', 'export function brew(): number { return 1; }\n');
    writeFile(repo, 'src/İstanbul.ts', 'export function district(): string { return "x"; }\n');
    writeFile(repo, 'src/plain.ts', 'export function ordinary(): number { return 2; }\n');
    commit(repo, 'source files with non-ascii names');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  it('finds the symbols declared in non-ASCII-named files', async () => {
    const rows = await vault.query<{ name: string }>(
      `SELECT name FROM nodes WHERE name IN ('brew', 'district', 'ordinary')`);
    const names = rows.map(r => r.name).sort();
    // `ordinary` is the control: if it is missing the fixture never analyzed and the other two
    // assertions would pass vacuously for the wrong reason.
    expect(names).toEqual(['brew', 'district', 'ordinary']);
  });

  it('records their files under the real path, not git\'s quoted spelling', async () => {
    const rows = await vault.query<{ file: string }>(
      `SELECT DISTINCT file FROM nodes WHERE file LIKE '%caf%' OR file LIKE '%stanbul%'`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.file).not.toContain('\\3');   // an octal escape from core.quotePath
      expect(r.file).not.toContain('"');     // git's surrounding quotes
    }
  });
});
