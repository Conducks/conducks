import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli } from './helpers.js';

/**
 * ADR 0080 — a read-only command answers the question and says nothing else (todo02#P2).
 *
 * `logger-quiet.test.ts` covers the sink. This covers the WIRING, which nothing did: the CLI decides
 * per command whether narration is wanted, hands that decision to composition, and composition calls
 * `setProcessQuiet`. Three hops, and a break in any of them leaves five boot lines in front of every
 * answer an agent parses — which is exactly the state ADR 0080 was written about.
 *
 * Asserted through a REAL process, because that is the only place the decision is made. Calling
 * `setProcessQuiet` from a test proves the flag works and proves nothing about who sets it.
 *
 * The `--verbose` case is the counter-test: a suite that only checked for silence would pass just as
 * well against a logger that had been deleted.
 *
 * What quiet does NOT suppress — warnings, errors, successes — is `logger-quiet.test.ts`'s job and
 * is asserted there against the sink directly, which is where it can be asserted precisely.
 */
describe('a read-only command narrates nothing', () => {
  let repo = '';

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('conducks-quiet-');
    writeFile(repo, 'src/a.ts', 'export const a = 1;\n');
    commit(repo, 'first');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => { if (repo) fs.rmSync(repo, { recursive: true, force: true }); });

  it('prints no boot narration to stderr', () => {
    const res = runCli(['status'], { cwd: repo });

    // The five lines by name. A substring check on "Conducks" would pass for a run that printed a
    // different one of them, and each of these was measured leaking separately.
    expect(res.stderr).not.toContain('Initializing Native Grammar Engine');
    expect(res.stderr).not.toContain('Native Grammar Engine Ready');
    expect(res.stderr).not.toContain('Structural Diagnostic Sink anchored');
    expect(res.stderr).not.toContain('Structural Synapse Anchored');
    expect(res.stderr).not.toContain('Pushing Structural Resonance Flow');
  }, 120000);

  it('still narrates under --verbose, which is what makes the silence a decision', () => {
    const res = runCli(['status', '--verbose'], { cwd: repo });

    expect(res.stderr).toContain('Native Grammar Engine');
  }, 120000);
});
