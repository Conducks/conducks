import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Metrics domain. STALE NAME: the todo names `conducks_metrics` — no MCP tool by that name
// exists. The real metrics capability is registry.explain (MetricsService: prune, entropy,
// composite risk, cohesion), reachable via the MCP tools `conducks_explain` / `conducks_prune`,
// and via the CLI `explain` / `prune` commands directly (both call the same registry.explain.*
// facade). This suite drives the CLI form.
describe('Metrics domain integration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('metrics');
    writeFile(repo, 'src/used.ts', `
export function usedFn(): number {
  return 1;
}
`);
    writeFile(repo, 'src/consumer.ts', `
import { usedFn } from './used.js';
export function consume(): number {
  return usedFn();
}
`);
    writeFile(repo, 'src/dead.ts', `
export function neverCalledAnywhere(): number {
  return 0;
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  it('explain computes a real composite risk decomposition for a real symbol', () => {
    const { combined } = runCli(['explain', 'usedFn'], { cwd: repo });
    expect(combined).toContain('Composite Risk Rating');
    expect(combined).toContain('gravity:');
    expect(combined).toContain('complexity:');
    expect(combined).toContain('entropy:');
  });

  it('explain fails clearly for a symbol that does not exist (proves resolution is real, not a stub)', () => {
    const { combined, status } = runCli(['explain', 'zzz_totally_fake_symbol_zzz'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toContain('not found');
  });

  it('prune flags the real unused export and does not flag the real used one', () => {
    const { combined } = runCli(['prune'], { cwd: repo });
    expect(combined).toContain('neverCalledAnywhere');
    expect(combined).not.toContain('- [UNUSED_EXPORT] usedFn');
  });

  // Assertion can fail: once a real caller is added, prune must stop flagging the symbol.
  it('prune stops flagging the symbol once a real caller is added (proves prune reads the live graph)', () => {
    writeFile(repo, 'src/consumer.ts', `
import { usedFn } from './used.js';
import { neverCalledAnywhere } from './dead.js';
export function consume(): number {
  return usedFn() + neverCalledAnywhere();
}
`);
    commit(repo, 'wire up dead code');
    runCli(['analyze', '--yes'], { cwd: repo });

    const { combined } = runCli(['prune'], { cwd: repo });
    expect(combined).not.toContain('neverCalledAnywhere');
  });
});
