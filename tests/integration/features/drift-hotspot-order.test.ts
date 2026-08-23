import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Two defects in one block, both MEASURED on the scraper subject after a single two-line edit:
 *
 *   - Decaying: 1
 *   🚀 Top Structural Decay Hotspots (Velocity)
 *   1. str          [Velocity: 0.0261]
 *   2. len          [Velocity: 0.0302]
 *   3. get_data_dir [Velocity: 0.5000]
 *
 * The list is UNSORTED, so a heading that says "Top" printed the least significant entry first and
 * buried the symbol actually edited — 19x the velocity — in last place. The improving block directly
 * below it sorts correctly; the decay block was missed when that was added.
 *
 * And the summary disagrees with its own list: `decay_count` counts `velocity > DECAY_VELOCITY_
 * THRESHOLD` (0.05) while the renderer listed `velocity > 0.01`, so three rows appeared under a
 * count of one.
 *
 * Both assertions here are structural — sortedness and agreement — so they hold whatever the
 * fixture's exact velocities turn out to be.
 */
describe('drift ranks its decay hotspots', () => {
  let repo: string;
  let out: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('drift-hotspot-order');

    // Several symbols, so more than one can move and an ordering can be wrong.
    writeFile(repo, 'src/a.ts', `
export function alpha(n: number): number { return n + 1; }
export function beta(n: number): number { return n + 2; }
export function gamma(n: number): number { return n + 3; }
export function delta(n: number): number { return n + 4; }
`);
    writeFile(repo, 'src/main.ts', `
import { alpha, beta, gamma, delta } from './a.js';
export function boot(n: number): number { return alpha(n) + beta(n) + gamma(n) + delta(n); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // alpha gains real branching; the others are untouched. alpha must rank above anything that
    // merely drifted through gravity redistribution.
    writeFile(repo, 'src/a.ts', `
export function alpha(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  for (let i = 0; i < n; i++) { if (i % 3 === 0) n += 1; else if (i % 5 === 0) n -= 1; }
  while (n > 50) { n = n - 7; }
  return n + 1;
}
export function beta(n: number): number {
  if (n < 0) return 0;
  for (let i = 0; i < 3; i++) { n += i; }
  return n + 2;
}
export function gamma(n: number): number { return n + 3; }
export function delta(n: number): number { return n + 4; }
`);
    // A NEW file, so gravity redistributes across untouched symbols. That is what produces the small
    // velocities between the renderer's 0.01 floor and the summary's 0.05 one — the band where the
    // two disagreed. MEASURED on this fixture: beta lands at 0.0206 while the summary counts 1.
    writeFile(repo, 'src/extra.ts', `
import { beta } from './a.js';
export function widen(n: number): number { return beta(n); }
export function widen2(n: number): number { return beta(n) + 1; }
`);
    runCli(['analyze', '--yes'], { cwd: repo });
    out = plain(runCli(['drift'], { cwd: repo, allowFail: true }).combined);
  }, 300000);

  afterAll(() => rmRepo(repo));

  const listed = () => {
    const block = out.split('Top Structural Decay Hotspots')[1];
    if (!block) return [];
    const upTo = block.split('Top Improving Symbols')[0];
    return [...upTo.matchAll(/\[Velocity: (-?\d+\.\d+)\]/g)].map(m => Number(m[1]));
  };

  it('lists the decay hotspots highest velocity first', () => {
    const v = listed();
    // Guard: an empty list would make the sortedness assertion vacuously true.
    expect(v.length).toBeGreaterThan(0);
    const sorted = [...v].sort((a, b) => b - a);
    expect(v).toEqual(sorted);
  }, 180000);

  it('lists exactly as many symbols as the summary counted', () => {
    const m = /Decaying:\s*(\d+)/.exec(out);
    expect(m).not.toBeNull();
    const claimed = Number(m![1]);
    expect(claimed).toBeGreaterThan(0);
    // The block caps at 10; below that the two numbers must agree exactly.
    expect(listed().length).toBe(Math.min(claimed, 10));
  }, 180000);
});
