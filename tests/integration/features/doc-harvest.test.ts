import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0133 / todo40 — the graph knows what a symbol IS, not only where it sits.
 *
 * Before this, `context calculateSplitScore` answered with its neighbours — `ConducksAdvisor,
 * getNeighbors, ConducksNode, math` — because the graph stored structure and no meaning. "What does
 * it do" had no answer from conducks OR from grep.
 *
 * The meaning was already written and already parsed: every grammar captures comments as `@comment`
 * (Python additionally tags its docstring), the reflector already received them for TODO/FIXME
 * scanning, and the prose was discarded on every pulse.
 *
 * THE HARVEST CROSSES FOUR BOUNDARIES and was silently dropped at the third. Measured during the
 * build: the join reported `attached: 1` while the `doc` column stayed NULL, because
 * `ConducksAdjacencyList.addNode` keeps a FIXED property skeleton and anything not named in it is
 * discarded — the same trap that cost a session for the route columns and `instanceOf` before it.
 * These tests exercise the whole path, which is the only way that class of defect is visible.
 */
describe('doc harvest', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('doc-harvest');
    writeFile(repo, 'src/a.ts',
      '/**\n' +
      ' * Trims a user-supplied name before storing it.\n' +
      ' *\n' +
      ' * Longer detail that must not appear in a one-line header.\n' +
      ' */\n' +
      'export function format(name: string): string {\n' +
      '  return name.trim();\n' +
      '}\n' +
      '\n' +
      'export function undocumented(): number {\n' +
      '  return 1;\n' +
      '}\n');
    writeFile(repo, 'src/b.ts',
      '/** Retries a flaky network call three times. */\n' +
      'export function withRetry(): void {}\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('explain returns the author\'s own description', () => {
    const { stdout } = runCli(['explain', 'format', '--json'], { cwd: repo, allowFail: true });
    expect(JSON.parse(stdout).doc).toMatch(/Trims a user-supplied name/);
  }, 120000);

  it('explain keeps the detail, not only the first line', () => {
    const { stdout } = runCli(['explain', 'format', '--json'], { cwd: repo, allowFail: true });
    expect(JSON.parse(stdout).doc).toMatch(/Longer detail/);
  }, 120000);

  /**
   * An undocumented symbol is a FACT about the codebase, not a gap to be filled. ADR 0133 rejects
   * generating a summary: the author's sentence is evidence, a generated one is a guess in the same
   * font, and this project has spent thirty ADRs learning to tell those apart.
   */
  it('reports an undocumented symbol as undocumented, never inventing one', () => {
    const { stdout, combined } = runCli(['explain', 'undocumented', '--json'], { cwd: repo, allowFail: true });
    expect(JSON.parse(stdout).doc).toBeNull();
    const human = runCli(['explain', 'undocumented'], { cwd: repo, allowFail: true });
    expect(human.combined).toMatch(/undocumented/i);
    expect(combined).not.toMatch(/Trims a user-supplied name/);
  }, 120000);

  /** The capability grep cannot have: find a symbol by what it is FOR. */
  it('finds a symbol by its purpose', () => {
    const { stdout } = runCli(['query', '--doc', 'flaky', '--json'], { cwd: repo, allowFail: true });
    const rows = JSON.parse(stdout);
    expect(rows.map((r: any) => r.name)).toContain('withRetry');
    // A purpose hit and a name hit are different claims, and the answer says which.
    expect(rows[0].matched).toBe('purpose');
  }, 120000);

  it('does not match a term that appears nowhere in any description', () => {
    const { stdout } = runCli(['query', '--doc', 'zzznotathing', '--json'], { cwd: repo, allowFail: true });
    expect(JSON.parse(stdout)).toEqual([]);
  }, 120000);

  /**
   * An empty result has two causes — nothing matched, or nothing was ever harvested — and reporting
   * them identically is the shape CONDUCKS-37 exists to prevent.
   */
  it('tells "no match" from "nothing was harvested"', () => {
    const { combined } = runCli(['query', '--doc', 'zzznotathing'], { cwd: repo, allowFail: true });
    expect(combined).toMatch(/searched \d+ documented symbol/);
  }, 120000);
});
