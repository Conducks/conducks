import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0113 — `entry` answers "where does execution begin".
 *
 * Measured before the fix, on conducks itself: it printed TWELVE rows, every one a test file or a
 * debug script, and omitted the actual bin — which the vault had flagged correctly. Meanwhile 603
 * nodes carried the flag, including 203 local VARIABLES named `start`/`index`/`cmd`/`server` and 3
 * DIRECTORIES named `cli`, because the name heuristics tested the NAME and never the KIND.
 *
 * This is the orientation command. A wrong answer sends a reader to the least important code in the
 * project and calls it the way in — so the assertions below are mostly about what must NOT appear.
 */
describe('entry reports where execution begins', () => {
  let repo: string;

  const entries = () => JSON.parse(runCli(['entry', '--json'], { cwd: repo }).stdout) as Array<{
    id: string; name: string; kind: string; file: string; line: number | null; reason: string | null;
  }>;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('entry-points');

    // The real entry: a bin that imports the app and is imported by nothing but a test.
    writeFile(repo, 'src/cli.ts',
      "import { runApp } from './app.js';\nrunApp();\n");
    writeFile(repo, 'src/app.ts',
      "import { helper } from './helper.js';\nexport function runApp(): number { return helper(); }\n");
    writeFile(repo, 'src/helper.ts', 'export function helper(): number { return 1; }\n');

    // A BARREL. Named index.ts, imports things, and is NOT where execution starts — the old rule
    // flagged every index.ts by filename alone.
    writeFile(repo, 'src/index.ts', "export { runApp } from './app.js';\n");

    // Local variables sharing a name with the old heuristic list. None is an entry point.
    writeFile(repo, 'src/decoys.ts',
      'export function decoys(): number {\n' +
      '  const start = 1;\n  const index = 2;\n  const server = 3;\n  const cmd = 4;\n' +
      '  return start + index + server + cmd;\n}\n');

    // A TEST importing the entry — this must not disqualify it, and the test itself must not appear.
    writeFile(repo, 'tests/cli.test.ts',
      "import '../src/cli.js';\nexport function checksCli(): boolean { return true; }\n");

    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  /**
   * The one that failed before: the bin is imported by a test, and counting test importers meant
   * `importedBy > 0`, so the only real entry point in the project went unreported.
   */
  it('reports the bin even though a test imports it', () => {
    expect(entries().some(e => e.file?.endsWith('src/cli.ts'))).toBe(true);
  }, 120000);

  it('reports no test file', () => {
    for (const e of entries()) expect(e.file ?? '').not.toMatch(/tests?\//);
  }, 120000);

  /** A local variable named `start` is not an entry point; 203 such were flagged before. */
  it('reports no local variable or directory', () => {
    for (const e of entries()) expect(['ATOM', 'DIRECTORY']).not.toContain(e.kind);
  }, 120000);

  /** A barrel is the most common file in a TS project and is never where execution starts. */
  it('does not flag a barrel purely because it is called index.ts', () => {
    const barrel = entries().find(e => e.file?.endsWith('src/index.ts'));
    // If it appears at all it must be for a stated structural reason, never `entry-filename`.
    expect(barrel?.reason).not.toBe('entry-filename');
  }, 120000);

  /** Every answer must be arguable: which rule fired, and where the thing is. */
  it('states a reason and a location for every entry point', () => {
    const rows = entries();
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(['route', 'entry-filename', 'root-module']).toContain(e.reason);
      expect(e.file).toBeTruthy();
      // The FULL id — the old table printed `"..." + last 47 chars`, which cannot be fed back in.
      expect(e.id).not.toContain('...');
      expect(e.id).toContain('::');
    }
  }, 120000);
});
