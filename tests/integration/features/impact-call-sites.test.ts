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

  /**
   * A TRUE ZERO AND A BROKEN ZERO MUST NOT PRINT THE SAME OUTPUT (todo44#P6).
   *
   * Measured on the frozen scraper subject: `impact classify` said `0 Symbols affected` and was
   * RIGHT — nobody calls it. `impact resolve_project_path` said the same and was WRONG — ten callers
   * existed, every one sitting in the graph's unresolved bucket. The reader could not tell the
   * honest empty from the resolution failure, which is CONDUCKS-37 in its most expensive form.
   * An empty answer now states what was examined and how many unresolved references share the
   * symbol's name — the number that decides whether the zero is trustworthy.
   */
  it('an empty answer states what it examined', () => {
    const { combined } = runCli(['impact', 'unusedHelper'], { cwd: repo, allowFail: true });
    expect(combined).toMatch(/0 Symbols affected/);
    // What the zero rests on: edges examined, unresolved total, and same-name unresolved.
    expect(combined).toMatch(/examined [0-9,]+ edge/i);
    expect(combined).toMatch(/unresolved/i);
    // Nothing unresolved shares this name in this fixture, and the output says so outright.
    expect(combined).toMatch(/none of them (share|match)|0 of them/i);
  }, 120000);

  /**
   * `--depth` bounds the walk. The vs-grep benchmark pre-registered `impact X --depth 2` and the
   * flag did not exist — the engine had taken a depth parameter all along (default 5) and the CLI
   * never passed it. At depth 1 only the direct caller may appear; `main`, which reaches `format`
   * through `fetchUser`, must not.
   */
  it('honours --depth', () => {
    const deep = runCli(['impact', 'format'], { cwd: repo, allowFail: true }).combined;
    expect(deep).toMatch(/main/);
    const shallow = runCli(['impact', 'format', '--depth', '1'], { cwd: repo, allowFail: true }).combined;
    expect(shallow).toMatch(/fetchUser/);
    expect(shallow).not.toMatch(/\bmain\b/);
  }, 240000);

  it('still carries the machine-readable fields for an agent', () => {
    const { stdout } = runCli(['impact', 'format', '--json'], { cwd: repo, allowFail: true });
    const j = JSON.parse(stdout);
    const caller = (j.affectedNodes ?? []).find((n: any) => n.name === 'fetchUser');
    expect(caller.line).toBeGreaterThan(0);
    expect(Array.isArray(caller.lines)).toBe(true);
  }, 120000);
});
