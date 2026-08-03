import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0121 — a symbol named `unit` must not overwrite the file it lives in.
 *
 * A file node's id is `<path>::unit`. A symbol node's id is `<path>::<name>`. So a local variable
 * literally named `unit` produces the SAME id as the file that contains it, and `INSERT OR REPLACE`
 * hands the file's row to the variable:
 *
 *     canonicalKind  ATOM      (was UNIT)
 *     semantic_kind  variable  (was file)
 *     canonicalRank  9         (was 5)
 *
 * Measured on conducks: 4 of 666 file nodes were destroyed this way, and every one of the four
 * files declares `const unit = ...`. The file keeps its MEMBER_OF edges from every symbol inside it
 * and its IMPORTS edges from other files — so the graph now says a *variable* contains twenty
 * functions and is imported by four modules.
 *
 * It surfaced as nine phantom `rank_violation` findings in `conducks guard`, reported for months as
 * "pre-existing, tracked". A number carried as acceptable for long enough stops being read.
 */
describe('a symbol named `unit` does not overwrite its own file', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('unit-collision');
    // The collision exactly as it occurs in the wild: `const unit` inside an ARROW CALLBACK passed
    // to a call. A `const unit` inside a named function does NOT reproduce it — that one gets a
    // scoped id — so the fixture has to match the real shape, which is what every affected file
    // (all four are jest tests) actually looks like.
    writeFile(repo, 'src/collide.ts',
      'declare function register(name: string, fn: () => void): void;\n' +
      '\n' +
      'register("case one", () => {\n' +
      '  const unit = "a-value";\n' +
      '  console.log(unit);\n' +
      '});\n' +
      '\n' +
      'export function build(): string { return "x"; }\n');
    writeFile(repo, 'src/plain.ts', 'export function plain(): number { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('keeps the file node a UNIT', () => {
    const { stdout } = runCli(['query', 'collide.ts', '--json'], { cwd: repo });
    const rows = JSON.parse(stdout);
    const fileNode = rows.find((r: any) => r.name === 'collide.ts');
    expect(fileNode).toBeDefined();
    expect(fileNode.kind).toBe('UNIT');
  }, 120000);

  /**
   * The file whose node was overwritten still had every edge pointing at it, so the damage is not
   * confined to one row: `explain` on the file reported a variable's risk profile.
   */
  it('explains the file as a file, not as a variable', () => {
    const { stdout } = runCli(['explain', 'collide.ts', '--json'], { cwd: repo, allowFail: true });
    expect(JSON.parse(stdout).kind).toBe('UNIT');
  }, 120000);
});
