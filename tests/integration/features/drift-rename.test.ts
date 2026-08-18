import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * `drift` answered "✅ Structural resonance stable … Renamed/Moved: 0" immediately after conducks
 * itself renamed a function at five call sites across three files. A false green from the command
 * whose whole job is to notice change.
 *
 * The move query matched on `fingerprint`, which hashes `path|name|dna` — so a RENAME changes it and
 * the join can never fire. What the join could find was a symbol that MOVED while keeping its name,
 * which is why the sofie run appeared to work: its four reported "renames" were all CHILD symbols
 * (`registermemoryipc.now` → `registermemoryipcrenamed.now`) whose own names never changed. A leaf
 * function has no children, so on the orchestrator subject the same experiment reported nothing.
 *
 * A second identity is recorded now — the same hash WITHOUT the name — and the join matches on that.
 * Re-run against the original scenario: 5 sites, 3 files, `Renamed/Moved: 1`.
 */
describe('drift reports a rename it can see', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('drift-rename');

    writeFile(repo, 'src/leaf.ts', `
/** A LEAF: no members, so nothing inside it can betray the rename on its behalf. */
export function leafFunction(): number { return 1; }
`);
    writeFile(repo, 'src/main.ts', `
import { leafFunction } from './leaf.js';
export function boot(): number { return leafFunction(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    runCli(['rename', 'leafFunction', 'leafFunctionRenamed', '--confirm'], { cwd: repo });
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('counts the rename instead of reporting an unqualified stable', () => {
    // Rendered output is colourised and ANSI codes contain DIGITS. The previous assertion here,
    // `/Renamed\/Moved:\s*\D*[1-9]/`, let `\D*` consume the ESC and `[` of `\x1b[35m` and then
    // matched the `3` of the colour code itself — so it passed on `Renamed/Moved: 0` too, and could
    // not fail on the number it claimed to check. (The `structural rename(s) detected` assertion
    // below was carrying this test on its own; that string is only emitted when moves.length > 0.)
    const out = plain(runCli(['drift'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/Renamed\/Moved:\s*[1-9]/);
    expect(out).toContain('structural rename(s) detected');
  }, 180000);

  it('names the symbol that was renamed', () => {
    const out = runCli(['drift'], { cwd: repo, allowFail: true }).combined;
    expect(out).toContain('leafFunctionRenamed');
  }, 180000);
});

/**
 * `guard` is a CI gate. Its clean verdict replaced drift's coverage statement with a flat "no
 * regression detected", so it printed a pass over a comparison that could see a fraction of the
 * codebase — MEASURED on a two-pulse fixture where drift reported "15 symbol(s) had no fingerprint
 * on one side … not confirmed stable" and guard answered "✅ … No regression detected."
 *
 * Same rule the INSUFFICIENT_DATA branch already keeps (ADR 0044): a check that ran on nothing is
 * not a pass, and a check that ran on a fraction has to say which fraction.
 */
describe('guard states what it could not compare', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('guard-coverage');
    writeFile(repo, 'src/leaf.ts', `export function leafFunction(): number { return 1; }\n`);
    writeFile(repo, 'src/main.ts', `
import { leafFunction } from './leaf.js';
export function boot(): number { return leafFunction(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    runCli(['rename', 'leafFunction', 'leafFunctionRenamed', '--confirm'], { cwd: repo });
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('does not print an unqualified pass when symbols were not comparable', () => {
    const out = runCli(['guard'], { cwd: repo, allowFail: true }).combined;
    const drift = runCli(['drift'], { cwd: repo, allowFail: true }).combined;
    const blind = /(\d+) symbol\(s\) had no fingerprint/.exec(drift);
    if (blind && Number(blind[1]) > 0) {
      expect(out).toMatch(/NOT compared|not comparable|NOT ASSESSED/);
    } else {
      // Nothing was blind — the unqualified pass is the honest answer, and must survive.
      expect(out).toMatch(/stable|acceptable/i);
    }
  }, 180000);
});
