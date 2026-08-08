import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * An EMPTY vault must not report a healthy one (todo49 Phase 2b, ADR 0124).
 *
 * FOUND by driving `conducks clean` — the last CLI command with no test at all. On a 0-node vault it
 * printed `Status: READY`, `Staleness: SYNCHRONIZED`, `Pulse: none` and a bare hotspot header, and
 * nothing anywhere said the graph was empty. The cause was not a missing branch but a CONSTANT:
 * `status()` and `statusFromVault()` both returned the string literal `'ready'`, so the field could
 * never have said anything else. The `incomplete` health check could not cover it either — its
 * `nodeCount > 50` guard excludes the empty case by construction.
 *
 * Checked on BOTH surfaces. `status()` feeds the CLI and `statusFromVault()` feeds MCP, and the two
 * answering differently under one field name is exactly how `density` drifted 5,000x.
 */
describe('an empty vault reports empty, not healthy', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('emptyvault');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'ev', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/index.ts', 'export function alpha(): number { return 1; }\nexport function beta(): number { return alpha(); }\n');
    commit(repo, 'a project to empty');
  });

  afterAll(() => rmRepo(repo));

  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const statusJson = () => JSON.parse(runCli(['status', '--json'], { cwd: repo }).stdout);

  it('a populated vault still reads READY — the fix must not invert the verdict', () => {
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const j = statusJson();
    expect(j.stats.nodeCount).toBeGreaterThan(0);
    expect(j.status).toBe('ready');
    expect(j.health.empty).toBe(false);

    const out = plain(runCli(['status'], { cwd: repo }).combined);
    expect(out).toMatch(/Status:\s*READY/);
    expect(out).not.toMatch(/EMPTY VAULT/);
  });

  it('clean succeeds and leaves the vault directory in place — its actual contract', () => {
    const r = runCli(['clean'], { cwd: repo, allowFail: true });
    expect(r.status).toBe(0);
    // `clean` is described as a "Nuclear Purge", which reads as removing the vault. It does NOT: it
    // evicts handles and purges the structural cache, and the .conducks directory and its database
    // file survive. Pinned because nothing stated the contract before this test, so any future
    // change to it was indistinguishable from a bug.
    expect(existsSync(path.join(repo, '.conducks'))).toBe(true);
  });

  it('after clean the graph is empty, and status SAYS so instead of READY', () => {
    const j = statusJson();
    expect(j.stats.nodeCount).toBe(0);
    expect(j.stats.edgeCount).toBe(0);
    // The verdict field itself, which used to be the literal 'ready' on every possible input.
    expect(j.status).toBe('empty');
    expect(j.health.empty).toBe(true);
    expect(String(j.health.reason)).toMatch(/no symbols|nothing has been analyzed/i);
  });

  it('the human output names the empty vault and refuses to claim SYNCHRONIZED', () => {
    const out = plain(runCli(['status'], { cwd: repo }).combined);
    expect(out).toMatch(/Status:\s*EMPTY/);
    expect(out).toMatch(/EMPTY VAULT/);
    // "In sync" is a claim about nothing when no symbols are stored: there is no analysis for HEAD
    // to be ahead of, so neither SYNCHRONIZED nor STALE is true.
    expect(out).not.toMatch(/SYNCHRONIZED/);
    expect(out).toMatch(/nothing analyzed/i);
    // A bare hotspot header over no rows reads as "no hotspots" — a finding — rather than "nothing
    // was ranked".
    expect(out).toMatch(/none — the vault is empty/i);
  });

  it('analyze restores it, and the verdict goes back to READY', () => {
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const j = statusJson();
    expect(j.stats.nodeCount).toBeGreaterThan(0);
    expect(j.status).toBe('ready');
    expect(j.health.empty).toBe(false);
  });
});
