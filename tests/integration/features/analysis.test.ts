import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Analysis domain: `conducks analyze` (AnalyzeOrchestrator -> AnalysisService -> real tree-sitter
// parse -> ConducksAdjacencyList -> DuckDB vault) driven end to end via the built CLI, then read
// back through `conducks status --json`. Real symbols, real graph, real vault — no hand-built
// fixture graph (CONDUCKS-28 does not apply: nothing here constructs node ids by hand).
describe('Analysis domain integration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('analysis');
    writeFile(repo, 'src/greeter.ts', `
export function buildGreeting(name: string): string {
  return 'Hello, ' + name;
}
export function shout(name: string): string {
  return buildGreeting(name).toUpperCase();
}
`);
    commit(repo, 'init');
  });

  afterAll(() => rmRepo(repo));

  it('pulses a real repo and persists a non-empty graph', () => {
    const { combined } = runCli(['analyze', '--yes'], { cwd: repo });
    expect(combined).toContain('🛡️');

    const { stdout: statusJson } = runCli(['status', '--json'], { cwd: repo });
    const status = JSON.parse(statusJson);
    expect(status.stats.nodeCount).toBeGreaterThan(0);
    expect(status.stats.edgeCount).toBeGreaterThan(0);
  });

  it('finds the real function symbol by name after the pulse', () => {
    const { stdout } = runCli(['query', 'buildGreeting', '--json'], { cwd: repo });
    const results = JSON.parse(stdout);
    expect(Array.isArray(results)).toBe(true);
    expect(results.some((r: any) => r.name === 'buildGreeting')).toBe(true);
  });

  // Assertion can fail: a symbol that was never written must never appear. This is the
  // control case proving the previous assertion is not vacuously true.
  it('does NOT find a symbol that was never written (proves the query can fail)', () => {
    const { stdout } = runCli(['query', 'thisSymbolDoesNotExistAnywhere', '--json'], { cwd: repo });
    const results = JSON.parse(stdout);
    expect(results.some((r: any) => r.name === 'thisSymbolDoesNotExistAnywhere')).toBe(false);
  });

  it('reflects an added symbol only after a fresh pulse (incremental analyze)', () => {
    // Before writing the new file, the graph must not know about it.
    let { stdout } = runCli(['query', 'brandNewFunction', '--json'], { cwd: repo });
    expect(JSON.parse(stdout).some((r: any) => r.name === 'brandNewFunction')).toBe(false);

    writeFile(repo, 'src/extra.ts', `export function brandNewFunction(): number { return 42; }`);
    commit(repo, 'add extra');
    runCli(['analyze', '--yes'], { cwd: repo });

    ({ stdout } = runCli(['query', 'brandNewFunction', '--json'], { cwd: repo }));
    expect(JSON.parse(stdout).some((r: any) => r.name === 'brandNewFunction')).toBe(true);
  });
});
