import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0131 — an external symbol nothing references any more leaves the vault.
 *
 * ADR 0050's re-stamp exists so that "a virtual node this pulse STILL DEPENDS ON" survives the
 * sweep. The implementation was broader than that sentence: it re-stamped EVERY `external://` node
 * unconditionally, so an external symbol became immortal the moment it was minted — even after the
 * code that referenced it was deleted, and even when the mint itself was a bug.
 *
 * Measured on conducks's own vault: 8 fake `route::`/`request::` library symbols minted by the
 * pre-ADR-0131 ingest defect survived TWO consecutive `analyze --force` runs with zero edges
 * pointing at them. The sweep could never collect them because every pulse stamped them afresh.
 *
 * The rule this test pins: an external SYMBOL is re-stamped only while some edge still points at
 * it, and a `lib::` namespace only while it still has a child. That is ADR 0050's own sentence,
 * enforced.
 */
describe('an unreferenced external symbol leaves the vault', () => {
  let repo: string;

  const externalSymbols = (): string[] => {
    const { stdout } = runCli(['query', 'ghostlib', '--json', '--limit', '50'], { cwd: repo, allowFail: true });
    try {
      return JSON.parse(stdout).map((r: any) => r.name);
    } catch {
      return [];
    }
  };

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('restamp');
    // v1 — a member call on an external module: `ghostlib.summon()` induces `lib::ghostlib` and the
    // symbol node, exactly the shape the fake routes took.
    writeFile(repo, 'src/a.ts',
      "import ghostlib from 'ghostlib';\n" +
      'export function invoke(): unknown {\n' +
      '  return ghostlib.summon();\n' +
      '}\n');
    commit(repo, 'v1');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('holds the external symbol while the code references it', () => {
    expect(externalSymbols().length).toBeGreaterThan(0);
  }, 120000);

  it('drops it once the reference is gone', () => {
    // v2 — the call and the import are deleted. Nothing references ghostlib any more.
    writeFile(repo, 'src/a.ts',
      'export function invoke(): unknown {\n' +
      '  return null;\n' +
      '}\n');
    commit(repo, 'v2');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    expect(externalSymbols()).toEqual([]);
  }, 300000);
});
