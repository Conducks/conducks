import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0123 — `fallback` reported "none found" for a field nothing writes.
 *
 * The `suspicious_fallbacks` template filters on
 * `json_extract(n.dna, '$.fallbackAnalysis.isFallback') = true`. Measured on conducks:
 *
 *     nodes 5472 | with dna 5472 | with fallbackAnalysis 0 | isFallback=true 0
 *
 * No node has ever carried that field, because `analyze` does not run the fallback detector — it
 * exists and is invoked on demand by `audit --fallback`. So the query cannot match, and the command
 * printed a green tick reading "✅ No suspicious fallback patterns found with current filters",
 * which is the ADR 0115 shape exactly: an absence presented as a clean verdict.
 *
 * The tick survived the most permissive filters possible (`--min-confidence 0 --min-tenure 0`),
 * which is the ADR 0111 rule — a command that can return empty needs an input that must NOT.
 *
 * `audit --fallback`, the path that DOES run the detector, crashed outright.
 */
describe('fallback distinguishes "none suspicious" from "never measured"', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('fallback-cmd');
    writeFile(repo, 'src/a.ts',
      'export function getConfig(): string {\n' +
      '  return process.env.CONFIG || "legacy-default";\n' +
      '}\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('does not report a clean verdict when the analysis was never produced', () => {
    const { combined } = runCli(
      ['fallback', '--min-confidence', '0', '--min-tenure', '0'], { cwd: repo, allowFail: true });
    // The exact string that made an absence look like a result.
    expect(combined).not.toMatch(/✅ No suspicious fallback patterns found/);
    expect(combined).toMatch(/not produced|never measured|no node carries/i);
  }, 120000);

  it('says how to produce the analysis rather than leaving the reader stuck', () => {
    const { combined } = runCli(['fallback'], { cwd: repo, allowFail: true });
    expect(combined).toMatch(/audit --fallback/);
  }, 120000);

  /** The path that actually runs the detector walked the graph without materialising it. */
  it('audit --fallback does not crash on a deferred graph', () => {
    const { combined, status } = runCli(['audit', '--fallback'], { cwd: repo, allowFail: true });
    expect(combined).not.toMatch(/not materialised/i);
    expect(status).toBe(0);
  }, 120000);
});
