import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Every example `conducks help` prints must be a command line conducks accepts (deep test 2026-11-12).
 *
 * MEASURED before the fix: the help showed `conducks context UserService --max-tokens 4000` twice, and
 * `context` answered "Unknown flag for `context`: --max-tokens". An example is the first thing a reader
 * copies; one that is refused teaches them the tool is wrong. A missing symbol or branch is fine here —
 * only a refusal of the command or a flag is a broken example.
 */
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('help examples', () => {
  let repo: string;
  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('help-examples');
    writeFile(repo, 'src/user.ts', 'export class UserService { run() { return 1; } }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterAll(() => rmRepo(repo));

  it('are all accepted', () => {
    const help = clean(runCli(['help'], { cwd: repo, allowFail: true }).combined);
    const examples = [...new Set(help.split('\n').map(l => l.trim()).filter(l => /^conducks [a-z]/.test(l)))];
    expect(examples.length).toBeGreaterThan(5);
    const refused: string[] = [];
    for (const ex of examples) {
      // `uninstall` and `setup` change the machine's agent configs — checked by their own tests.
      if (/^conducks (uninstall|setup|mcp|mirror|watch)\b/.test(ex)) continue;
      const args = (ex.slice('conducks '.length).match(/"[^"]*"|\S+/g) ?? []).map(a => a.replace(/^"|"$/g, ''));
      const out = clean(runCli(args, { cwd: repo, allowFail: true }).combined);
      if (/Unknown flag|Unknown command|unknown --|is not a conducks command/i.test(out)) refused.push(`${ex}  →  ${out.trim().split('\n')[0]}`);
    }
    expect(refused).toEqual([]);
  }, 240000);
});
