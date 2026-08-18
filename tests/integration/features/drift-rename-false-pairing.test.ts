import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Rendered drift output is colourised, and ANSI codes contain DIGITS (`\x1b[35m`). Asserting a
 * count with `\D*` against the raw string reads the `3` and `5` of the colour code as the number
 * and fails on output that is actually correct — a broken instrument reporting a broken fix.
 */
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Two regressions introduced BY the shape-fingerprint fix in `drift-rename.test.ts`, both found
 * during benchmark re-verification and both proven new by measurement rather than by reading code:
 * reverting the join to the old name-inclusive `fingerprint` column makes each symptom vanish — and
 * takes real rename detection with it, which is the bug that fix existed to solve. So these are not
 * old defects surfacing; the fix traded a false negative for two false positives.
 *
 * 1. NO DISAPPEARANCE GUARD. The query established that the CURRENT symbol is new, never that the
 *    PREVIOUS one went away. An untouched symbol stayed eligible as a rename SOURCE for anything
 *    sharing its shape. MEASURED: two same-shape functions, rename only one, drift reported TWO
 *    renames — the real one plus `get_data_dir -> get_root_directory`, where `get_data_dir` was
 *    never touched and still sits in the file.
 *
 * 2. MANY-TO-MANY FAN-OUT. Pairing on shape alone means N new and M vanished symbols of one shape
 *    produce N*M rows. MEASURED: two same-shape functions renamed in ONE commit reported FOUR
 *    renames — every combination, two of them provably wrong. The guard in (1) does not help here:
 *    both old symbols genuinely vanished, so all four pairs are legal to SQL.
 *
 * Both matter beyond cosmetics — `guard.ts` pushes a CI risk factor straight off `moves.length`.
 */
describe('drift does not invent renames that did not happen', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('drift-false-pairing');

    // Identical SHAPE, different names — the exact condition the shape-only join collides on.
    writeFile(repo, 'src/paths.ts', `
export function getProjectRoot(): string { return String(process.cwd()); }
export function getDataDir(): string { return String(process.cwd()); }
`);
    writeFile(repo, 'src/main.ts', `
import { getProjectRoot, getDataDir } from './paths.js';
export function boot(): string { return getProjectRoot() + getDataDir(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // Rename ONE. The sibling is deliberately left alone.
    runCli(['rename', 'getProjectRoot', 'getRootDirectory', '--confirm'], { cwd: repo });
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('reports exactly one rename when exactly one symbol was renamed', () => {
    const out = plain(runCli(['drift'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/Renamed\/Moved:\s*1\b/);
  }, 180000);

  it('never names the untouched sibling as a rename source', () => {
    const out = plain(runCli(['drift'], { cwd: repo, allowFail: true }).combined);
    // The precise false positive: a symbol that still exists cannot be where a name came FROM.
    expect(out).not.toMatch(/From:\s*getdatadir/i);
    // The real rename must still be the one reported — a fix that reported nothing would also pass
    // the assertion above.
    expect(out.toLowerCase()).toContain('getrootdirectory');
  }, 180000);
});

describe('drift pairs simultaneous same-shape renames one-to-one', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('drift-fanout');

    writeFile(repo, 'src/paths.ts', `
export function alphaOne(): string { return String(process.cwd()); }
export function betaTwo(): string { return String(process.cwd()); }
`);
    writeFile(repo, 'src/main.ts', `
import { alphaOne, betaTwo } from './paths.js';
export function boot(): string { return alphaOne() + betaTwo(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // BOTH renamed before the next pulse — so both old ids vanish and the disappearance guard is
    // satisfied for every candidate pair. Only 1:1 pairing can bring this back to 2.
    runCli(['rename', 'alphaOne', 'alphaRenamed', '--confirm'], { cwd: repo });
    runCli(['rename', 'betaTwo', 'betaRenamed', '--confirm'], { cwd: repo });
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('reports two renames, not the four-row cartesian product', () => {
    const out = plain(runCli(['drift'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/Renamed\/Moved:\s*2\b/);
  }, 180000);

  it('spends each old and each new name exactly once', () => {
    const out = plain(runCli(['drift'], { cwd: repo, allowFail: true }).combined).toLowerCase();
    const count = (needle: string) => out.split(needle).length - 1;
    // In the broken build every old name appeared twice (once per new name) and vice versa: four
    // "From:" lines for two renames. Which old name maps to which new one is genuinely unknowable
    // for identical shapes; that each is spent exactly once is not.
    expect(count('from:')).toBe(2);
    expect(count('alphaone')).toBe(1);
    expect(count('betatwo')).toBe(1);
  }, 180000);
});
