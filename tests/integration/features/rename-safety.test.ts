import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0106 — `rename` is the only tool that WRITES to a user's source.
 *
 * A wrong answer anywhere else misleads a reader. A wrong answer here edits code they did not ask
 * about, and the only record is their VCS diff. Measured before the fix, on a fixture:
 *
 *   - an unrelated `phone.ts::validate` — a different function that merely shared the name — was
 *     renamed, because affected files were collected by NAME MATCH rather than by edge
 *   - `console.log('validate failed')` became `'checkEmail failed'`
 *   - a comment reading "the word validate must survive" was rewritten
 *   - renaming `target` onto an existing `existing` produced a file declaring `existing` twice, and
 *     the command printed "✅ Successfully renamed"
 *
 * Each is the same missing thing: the writer knew WHICH FILES and nothing about WHERE. These tests
 * are written as "what must NOT change", because that is the half a rename tool gets wrong.
 */
describe('rename edits references and nothing else', () => {
  const repos: string[] = [];
  let repo: string;

  const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf-8');

  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('rename-safety');
    repos.push(repo);
    writeFile(repo, 'src/email.ts',
      '/** the word validate must survive in this comment. */\n' +
      'export function validate(i: string): boolean {\n  return i.includes("@");\n}\n');
    // A DIFFERENT function that merely shares the name. Nothing imports it from here.
    writeFile(repo, 'src/phone.ts',
      'export function validate(i: string): boolean {\n  return i.length === 11;\n}\n');
    writeFile(repo, 'src/caller.ts',
      "import { validate } from './email.js';\n" +
      'export function useIt(x: string): boolean {\n' +
      '  const ok = validate(x);\n' +
      "  console.log('validate failed');\n" +
      '  return ok;\n}\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => { for (const r of repos) rmRepo(r); });

  it('without --confirm nothing on disk changes', () => {
    const before = read('src/email.ts');
    const { combined } = runCli(['rename', `${repo}/src/email.ts::validate`, 'checkEmail'], { cwd: repo });
    expect(combined).toMatch(/DRY RUN/i);
    expect(read('src/email.ts')).toBe(before);
  }, 120000);

  it('renames the declaration, the import and the call site', () => {
    runCli(['rename', `${repo}/src/email.ts::validate`, 'checkEmail', '--confirm'], { cwd: repo });
    expect(read('src/email.ts')).toContain('function checkEmail');
    expect(read('src/caller.ts')).toContain("import { checkEmail }");
    expect(read('src/caller.ts')).toContain('const ok = checkEmail(x)');
  }, 120000);

  /** The one that matters: a same-named symbol in another file is a different symbol. */
  it('leaves an unrelated same-named function in another file completely alone', () => {
    const before = read('src/phone.ts');
    runCli(['rename', `${repo}/src/email.ts::validate`, 'checkEmail', '--confirm'], { cwd: repo });
    expect(read('src/phone.ts')).toBe(before);
  }, 120000);

  it('leaves the name alone inside a string literal and inside a comment', () => {
    runCli(['rename', `${repo}/src/email.ts::validate`, 'checkEmail', '--confirm'], { cwd: repo });
    expect(read('src/caller.ts')).toContain("console.log('validate failed')");
    expect(read('src/email.ts')).toContain('the word validate must survive');
  }, 120000);

  /** Two declarations of one name is not recoverable from the tool's own output. */
  it('refuses to rename onto a name already used in an affected file, and writes nothing', () => {
    writeFile(repo, 'src/collide.ts',
      'export function target(): number { return 1; }\n' +
      'export function existing(): number { return 2; }\n' +
      'export function useBoth(): number { return target() + existing(); }\n');
    commit(repo, 'collide');
    runCli(['analyze', '--yes'], { cwd: repo });

    const before = read('src/collide.ts');
    const { combined } = runCli(
      ['rename', `${repo}/src/collide.ts::target`, 'existing', '--confirm'],
      { cwd: repo, allowFail: true });

    expect(combined).toMatch(/already exists/i);
    expect(read('src/collide.ts')).toBe(before);
  }, 300000);

  it('refuses an unknown symbol', () => {
    const { status } = runCli(['rename', 'zzzNoSuchSymbol', 'whatever', '--confirm'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
  }, 120000);
});
