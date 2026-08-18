import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Three positions where Python READS a name, none of which the grammar captured — so a symbol used
 * only that way looked entirely unreferenced.
 *
 *   1. A DICT VALUE, which is how Python writes a dispatch table:
 *        levels = {"level1": Level1}; return levels.get(name, Level1)
 *      MEASURED on the scraper subject: `Level1`, `Level3`, `NameExtractor`, `RatingExtractor` and
 *      `ReviewCountExtractor` in `specialists/google_maps/specialist.py` are each used exactly this
 *      way and nowhere else.
 *   2. A CALL ARGUMENT — `levels.get(level_name, Level1)`, `register(HANDLERS)`.
 *   3. AN EXCEPTION TYPE — `except SpecialistNotFound:` is the only place `mapper_runner.py` names
 *      the exception it imports.
 *
 * The cost of the blind spot was measured directly: widening the stale-import calibration before
 * these captures existed produced 23 findings Python's own parser contradicts. With them, that same
 * experiment produced 1 — and that last one was `except SpecialistNotFound`, which is case 3.
 */
describe('python value positions are reads', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('py-value-positions');

    writeFile(repo, 'src/levels.py', [
      'class LevelOne:',
      '    def run(self):',
      '        return 1',
      '',
      'class LevelTwo:',
      '    def run(self):',
      '        return 2',
      '',
    ].join('\n'));

    writeFile(repo, 'src/errors.py', [
      'class SpecialErrorHappened(Exception):',
      '    pass',
      '',
    ].join('\n'));

    writeFile(repo, 'src/runner.py', [
      'from levels import LevelOne, LevelTwo',
      'from errors import SpecialErrorHappened',
      '',
      'def pick(name):',
      '    # DICT VALUE plus CALL ARGUMENT — the only places these two names appear.',
      '    table = {"one": LevelOne}',
      '    return table.get(name, LevelTwo)',
      '',
      'def guarded():',
      '    try:',
      '        return pick("one")',
      '    # EXCEPTION TYPE — the only place this name appears.',
      '    except SpecialErrorHappened:',
      '        return None',
      '',
    ].join('\n'));

    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('sees a class used only as a dict value', () => {
    const impact = JSON.parse(runCli(['impact', 'LevelOne', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(impact).toLowerCase()).toContain('pick');
  }, 180000);

  it('sees a class used only as a call argument', () => {
    const impact = JSON.parse(runCli(['impact', 'LevelTwo', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
  }, 180000);

  it('sees an exception class used only in an except clause', () => {
    const impact = JSON.parse(runCli(['impact', 'SpecialErrorHappened', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(impact).toLowerCase()).toContain('guarded');
  }, 180000);

  it('does not call any of them dead code', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const named = findings.map((f: any) => f.symbol);
    expect(named).not.toContain('LevelOne');
    expect(named).not.toContain('LevelTwo');
    expect(named).not.toContain('SpecialErrorHappened');
  }, 180000);

  it('still reports a genuinely unused import', () => {
    // The counter-test: capturing every identifier as a "read" would make staleness undetectable.
    writeFile(repo, 'src/unused.py', [
      'from levels import LevelOne, LevelTwo',
      '',
      'def only_uses_one():',
      '    return {"one": LevelOne}',
      '',
    ].join('\n'));
    commit(repo, 'add a file with one unused import');
    runCli(['analyze', '--yes'], { cwd: repo });

    const stale = JSON.parse(runCli(['prune', '--json', '--type', 'STALE_IMPORT'], { cwd: repo }).stdout);
    expect(stale.some((f: any) => f.symbol === 'LevelTwo' && String(f.file).includes('unused.py'))).toBe(true);
  }, 180000);
});
