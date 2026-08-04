import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0132 / todo39#P2 — the answer carries the call site, not a list of names.
 *
 * Measured against ripgrep before this existed: `rg resolveSymbol` returned 36 mixed text matches in
 * 17 ms; `conducks impact resolveSymbol` returned exactly 7 correct callers in 682 ms, printed as
 * `execute (…/cohesion.ts:38)`. This repository holds seven different `execute`s, so the name
 * identified nothing and the reader opened the file — and once they are opening files, grep got them
 * there first.
 *
 * The line numbers were already in the vault (ADR 0110) and already reached `--json`. Nothing read
 * the source back.
 *
 * The fixture is the hand-derived one from ADR 0129, whose every fact was worked out by hand before
 * anything ran: `main` calls `fetchUser`, `fetchUser` calls `format`, `unusedHelper` calls nothing.
 */
describe('impact prints the call site', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('impact-sites');
    writeFile(repo, 'src/util.ts',
      'export function format(name: string): string {\n' +
      '  return name.trim();\n' +
      '}\n');
    writeFile(repo, 'src/service.ts',
      "import { format } from './util.js';\n" +
      '\n' +
      'export function fetchUser(id: string): string {\n' +
      '  return format(id);\n' +
      '}\n' +
      '\n' +
      'export function unusedHelper(): number {\n' +
      '  return 42;\n' +
      '}\n');
    writeFile(repo, 'src/main.ts',
      "import { fetchUser } from './service.js';\n" +
      '\n' +
      'export function main(): string {\n' +
      "  return fetchUser('  alice  ');\n" +
      '}\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('prints the source line of the call, not just its number', () => {
    const { combined } = runCli(['impact', 'format'], { cwd: repo, allowFail: true });
    // The line a reader acts on. Without the source read this said only `fetchUser (…:4)`.
    expect(combined).toMatch(/return format\(id\);/);
  }, 120000);

  it('names the enclosing function and groups by file', () => {
    const { combined } = runCli(['impact', 'format'], { cwd: repo, allowFail: true });
    expect(combined).toMatch(/fetchUser/);
    expect(combined).toMatch(/service\.ts/);
    // Grouped: the file is a heading, so its path appears once rather than once per caller.
    expect(combined.match(/src\/service\.ts/g)?.length ?? 0).toBeLessThanOrEqual(2);
  }, 120000);

  it('labels direct and indirect rather than merging them', () => {
    const { combined } = runCli(['impact', 'format'], { cwd: repo, allowFail: true });
    expect(combined).toMatch(/direct/);
    // `main` reaches `format` only through `fetchUser` — grep cannot see it at all, and a list that
    // merged it with the direct caller would overstate what a change touches.
    expect(combined).toMatch(/indirect/);
  }, 120000);

  it('still carries the machine-readable fields for an agent', () => {
    const { stdout } = runCli(['impact', 'format', '--json'], { cwd: repo, allowFail: true });
    const j = JSON.parse(stdout);
    const caller = (j.affectedNodes ?? []).find((n: any) => n.name === 'fetchUser');
    expect(caller.line).toBeGreaterThan(0);
    expect(Array.isArray(caller.lines)).toBe(true);
  }, 120000);
});
