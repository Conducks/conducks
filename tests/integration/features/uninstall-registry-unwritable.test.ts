import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `uninstall` must not say it removed the project from the registry when the registry could not be
 * written (state-machine audit round 2, Q-08-5 / Q-05-5). `forget` dropped its write's result, so a
 * read-only `~/.conducks` printed "Removed ... from the project registry" and "Uninstall complete",
 * exit 0, while the entry stayed and `monitor` kept listing the project.
 */
describe('uninstall with a registry it cannot write', () => {
  let repo: string;
  let home: string;
  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('uninstall-unwritable');
    writeFile(repo, 'src/a.ts', 'export const a = 1;\n');
    commit(repo, 'init');
    // A fake HOME with no `.claude.json`: setup touches no real Claude Code config.
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-int-uninstall-ro-'));
  });
  afterAll(() => {
    try { fs.chmodSync(path.join(home, '.conducks'), 0o755); } catch { /* not there */ }
    fs.rmSync(home, { recursive: true, force: true });
    rmRepo(repo);
  });

  it('says the project is still listed, and exits non-zero', () => {
    if (process.getuid?.() === 0) return; // root writes into a 555 directory
    runCli(['setup', '--no-analyze'], { cwd: repo, env: { HOME: home }, allowFail: true });
    const dir = path.join(home, '.conducks');
    const file = path.join(dir, 'projects.json');
    const listed = () => (JSON.parse(fs.readFileSync(file, 'utf8')).projects as Array<{ root: string }>).map(p => fs.realpathSync(p.root));
    expect(listed()).toContain(fs.realpathSync(repo));

    fs.chmodSync(dir, 0o555);
    const { combined, status } = runCli(['uninstall'], { cwd: repo, env: { HOME: home }, allowFail: true });
    fs.chmodSync(dir, 0o755);

    expect(listed()).toContain(fs.realpathSync(repo));
    expect(combined).not.toMatch(/Removed .* from the project registry/);
    expect(combined).toMatch(/Could not remove .* from the project registry/);
    expect(status).not.toBe(0);
  }, 120000);
});
