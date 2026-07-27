import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Intelligence domain: `conducks query` (fuzzy mode -> IntelligenceService/ConducksSearch, and
// template mode -> AnalysisService/QueryService's Oracle Standard SQL library, whitelisted via
// ALLOWED_TEMPLATES in src/interfaces/tools/tools/synapse.ts). Note there is no MCP tool named
// `conducks_query` behaving differently here — the CLI `query` command is the same intelligence
// surface conducks_query wraps, so testing it through the CLI is testing the real component chain.
describe('Intelligence domain integration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('intelligence');
    writeFile(repo, 'src/pricing.ts', `
export function calculateDiscount(price: number): number {
  return price * 0.9;
}
export function applyDiscount(price: number): number {
  return calculateDiscount(price);
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  it('fuzzy mode finds a real symbol by (partial) name', () => {
    const { stdout } = runCli(['query', 'calculateDiscount', '--json'], { cwd: repo });
    const results = JSON.parse(stdout);
    expect(results.some((r: any) => r.name === 'calculateDiscount')).toBe(true);
  });

  it('fuzzy mode returns nothing for a name that was never written (proves it can fail)', () => {
    const { stdout } = runCli(['query', 'zzz_nonexistent_symbol_zzz', '--json'], { cwd: repo });
    const results = JSON.parse(stdout);
    expect(results.length).toBe(0);
  });

  it('template mode executes a real Oracle template (hotspots) against the persisted graph', () => {
    const { stdout } = runCli(
      ['query', '', '--mode', 'template', '--template', 'hotspots', '--limit', '5', '--json'],
      { cwd: repo }
    );
    const results = JSON.parse(stdout);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    // Every row must be a real persisted node, not a stub.
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('name');
  });

  it('template mode rejects an unknown template name (whitelist is enforced)', () => {
    const { combined, status } = runCli(
      ['query', '', '--mode', 'template', '--template', 'drop_table_students', '--json'],
      { cwd: repo, allowFail: true }
    );
    expect(status).not.toBe(0);
    expect(combined.toLowerCase()).toContain('template');
  });

  it('find_usages template finds the real caller of calculateDiscount', () => {
    // Resolve the real node id via the find_by_name template (returns raw `id`), rather than
    // guessing the `<file>::symbol` shape by hand (CONDUCKS-28: use the producer's id, never a
    // hand-built one).
    const byName = JSON.parse(
      runCli(['query', 'calculateDiscount', '--mode', 'template', '--template', 'find_by_name', '--json'], { cwd: repo }).stdout
    );
    expect(byName.length).toBeGreaterThan(0);
    const targetId = byName[0].id;

    const usages = JSON.parse(
      runCli(['query', `${targetId} CALLS`, '--mode', 'template', '--template', 'find_usages', '--json'], { cwd: repo }).stdout
    );
    expect(usages.some((u: any) => u.name === 'applyDiscount')).toBe(true);
  });
});
