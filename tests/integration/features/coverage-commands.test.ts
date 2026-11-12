import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0116 — `coverage` and `coverage-view`.
 *
 * These are the first commands in the sweep whose PRIMARY INPUT IS A FILE THE USER SUPPLIES rather
 * than the graph. So the standing question from ADR 0114 — *what does this print when its input is
 * damaged rather than absent?* — gains a second meaning: a file that parses as JSON but is not an
 * istanbul coverage report.
 *
 * Measured against the unfixed build:
 *
 *   coverage package.json      → "No BEHAVIOR nodes matched. (Ran `analyze` on this repo first?)"
 *                                exit 0 — and the named cause is wrong; analyze HAD been run
 *   coverage --vs-baseline     → 3 functions "(BROKE)", exit 0 — a gate that cannot fail
 *   coverage ... --vs-baseline --json → --json accepted and silently ignored
 *   coverage-view missing.json → error printed, exit 0
 *   coverage-view --out --watch→ wrote a file literally NAMED `--watch`
 *   any command from a subdir  → a raw DUCKDB_NODEJS_ERROR object, and `.conducks/` CREATED there
 */
describe('coverage commands refuse a file that is not a coverage report', () => {
  let repo: string;
  let covPath: string;
  let notCov: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('coverage');
    writeFile(repo, 'src/a.ts',
      'export function alpha(n: number): number {\n' +
      '  if (n > 0) { return n + 1; }\n' +
      '  return 0;\n' +
      '}\n');
    writeFile(repo, 'src/b.ts',
      'export function beta(n: number): number {\n' +
      '  const doubled = n * 2;\n' +
      '  return doubled;\n' +
      '}\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // A hand-built istanbul report: `alpha` fully ran, `beta` never did.
    //
    // realpath, not `repo`: on macOS the temp dir is reached through `/var` -> `/private/var`, the
    // vault stores what it resolved, and the binder's path match is deliberately anchored on a
    // path-segment boundary (it refuses a bare basename), so the two spellings do not join. That is
    // the binder being strict, not wrong — the fixture has to speak the same path the graph holds.
    const real = fs.realpathSync(repo);
    const aAbs = path.join(real, 'src/a.ts');
    const bAbs = path.join(real, 'src/b.ts');
    const stmt = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 10 } });
    covPath = path.join(repo, 'coverage-final.json');
    fs.writeFileSync(covPath, JSON.stringify({
      [aAbs]: {
        path: aAbs,
        statementMap: { '0': stmt(1), '1': stmt(2), '2': stmt(3), '3': stmt(4) },
        s: { '0': 1, '1': 1, '2': 1, '3': 1 },
        branchMap: { '0': { loc: stmt(2) } },
        b: { '0': [1, 0] },
      },
      [bAbs]: {
        path: bAbs,
        statementMap: { '0': stmt(1), '1': stmt(2), '2': stmt(3), '3': stmt(4) },
        s: { '0': 0, '1': 0, '2': 0, '3': 0 },
        branchMap: {}, b: {},
      },
    }));

    // Valid JSON, not an istanbul report — the shape a user hits by tab-completing the wrong file.
    notCov = path.join(repo, 'package.json');
    fs.writeFileSync(notCov, JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2));
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('binds a real report onto function spans', () => {
    const { stdout } = runCli(['coverage', covPath, '--json', '--all'], { cwd: repo });
    const rows = JSON.parse(stdout);
    const alpha = rows.find((r: any) => r.name === 'alpha');
    const beta = rows.find((r: any) => r.name === 'beta');
    expect(alpha.pct).toBeGreaterThan(0);
    expect(beta.pct).toBe(0);
  }, 120000);

  /**
   * The defect that names the wrong cause. The user ran `analyze`; they passed the wrong FILE, and
   * the message sent them to re-run the one thing that was already correct.
   */
  it('refuses a JSON file that is not an istanbul report, and says which', () => {
    const { combined, status } = runCli(['coverage', notCov], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/not an istanbul|not a coverage report/i);
    expect(combined).not.toMatch(/Ran .?analyze.? on this repo first/i);
  }, 120000);

  /** A coverage path is a path, not a suffix. `.info`, `.txt` or no extension is still a file. */
  it('reads a coverage file whose name does not end in .json', () => {
    const odd = path.join(repo, 'cov-report');
    fs.copyFileSync(covPath, odd);
    const { combined, status } = runCli(['coverage', odd, '--json'], { cwd: repo, allowFail: true });
    expect(status).toBe(0);
    expect(combined).not.toMatch(/Missing coverage file/i);
  }, 120000);

  /**
   * `--vs-baseline` exists to answer "did anything that used to work stop working". Printing
   * "(BROKE)" in red and exiting 0 means no CI step and no script can act on the answer.
   */
  it('exits non-zero when a function regressed against the baseline', () => {
    runCli(['coverage', covPath, '--save-baseline'], { cwd: repo });
    const bp = path.join(repo, '.conducks', 'coverage-baseline.json');
    const snap = JSON.parse(fs.readFileSync(bp, 'utf8'));
    // Claim beta used to be fully covered. It runs zero lines now — a hard break.
    for (const k of Object.keys(snap)) if (k.endsWith('::beta')) snap[k] = 100;
    fs.writeFileSync(bp, JSON.stringify(snap, null, 2));

    const { combined, status } = runCli(['coverage', covPath, '--vs-baseline'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/beta/);
  }, 120000);

  it('honours --json under --vs-baseline instead of silently ignoring it', () => {
    const { stdout, status } = runCli(['coverage', covPath, '--vs-baseline', '--json'], { cwd: repo, allowFail: true });
    const drift = JSON.parse(stdout);
    expect(Array.isArray(drift)).toBe(true);
    expect(drift.some((d: any) => d.status === 'REGRESSED')).toBe(true);
    expect(status).not.toBe(0);
  }, 120000);

  /**
   * State-machine audit P-09-2 / P-09-3. A report from ANOTHER checkout binds nothing. Saved as a
   * baseline it overwrote a good one with `{}` ("Saved coverage baseline for 0 functions", exit 0);
   * compared against a baseline it printed "No regressions. ✓" and exited 0 — so a regression gate
   * fed the wrong file passed, and the next one compared against an empty baseline.
   */
  it('refuses to save or compare a report that binds nothing, and keeps the baseline', () => {
    const foreign = path.join(repo, 'foreign-coverage.json');
    const elsewhere = '/somewhere/else/src/a.ts';
    fs.writeFileSync(foreign, JSON.stringify({
      [elsewhere]: {
        path: elsewhere,
        statementMap: { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } },
        s: { '0': 1 }, branchMap: {}, b: {},
      },
    }));
    runCli(['coverage', covPath, '--save-baseline'], { cwd: repo });
    const bp = path.join(repo, '.conducks', 'coverage-baseline.json');
    const good = fs.readFileSync(bp, 'utf8');

    const saved = runCli(['coverage', foreign, '--save-baseline'], { cwd: repo, allowFail: true });
    expect(saved.status).not.toBe(0);
    expect(fs.readFileSync(bp, 'utf8')).toBe(good);

    const compared = runCli(['coverage', foreign, '--vs-baseline'], { cwd: repo, allowFail: true });
    expect(compared.status).not.toBe(0);
    expect(compared.combined).not.toMatch(/No regressions/);
  }, 120000);

  /**
   * State-machine audit P-09-4 / P-09-5. `coverage-view --watch` never closed its `fs.watch`, so
   * Ctrl-C printed "Stopped watching." and the process stayed alive. And the watch was bound to the
   * report's INODE: a writer that saves by write-then-rename produced one re-render and then
   * silence for the rest of the session.
   */
  it('coverage-view --watch follows a report replaced by rename, and Ctrl-C ends it', async () => {
    const { spawn } = await import('node:child_process');
    const cli = path.resolve('build/src/interfaces/cli/index.js');
    const live = path.join(repo, 'live-coverage.json');
    fs.copyFileSync(covPath, live);
    const proc = spawn('node', [cli, 'coverage-view', live, '--watch', '--out', path.join(repo, 'live.html')], { cwd: repo });
    let out = '';
    proc.stdout.on('data', d => { out += String(d); });
    proc.stderr.on('data', d => { out += String(d); });
    const exited = new Promise<number | null>(r => proc.on('exit', code => r(code)));
    const until = async (test: () => boolean, ms = 30000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (test()) return true; await new Promise(r => setTimeout(r, 100)); }
      return false;
    };
    const renders = () => (out.match(/re-rendered/g) ?? []).length;
    const replace = () => {
      const tmp = `${live}.tmp`;
      fs.copyFileSync(covPath, tmp);
      fs.renameSync(tmp, live);
    };
    try {
      expect(await until(() => /Watching/.test(out))).toBe(true);
      replace();
      expect(await until(() => renders() >= 1)).toBe(true);
      await new Promise(r => setTimeout(r, 400));
      replace();
      expect(await until(() => renders() >= 2)).toBe(true);
      proc.kill('SIGINT');
      const code = await Promise.race([exited, new Promise<string>(r => setTimeout(() => r('STILL RUNNING'), 8000))]);
      expect(code).not.toBe('STILL RUNNING');
    } finally {
      proc.kill('SIGKILL');
    }
  }, 120000);

  /**
   * The `not.toMatch(/Missing coverage file/)` is the point, and it was missing the first time.
   * This asserted only a non-zero exit — which it got, from the WRONG message: the `--out` skip
   * index was `outIdx + 1` with no guard for `indexOf` returning -1, so with no `--out` present the
   * filter discarded the report itself and every invocation answered "Missing coverage file".
   * The test passed, the command was broken, and only running it by hand found it.
   */
  it('coverage-view exits non-zero when the coverage file cannot be read', () => {
    const { combined, status } = runCli(
      ['coverage-view', path.join(repo, 'no-such-report.json')], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).not.toMatch(/Missing coverage file/i);
    expect(combined).toMatch(/no-such-report\.json/);
  }, 120000);

  it('coverage-view renders with no --out at all, to the default filename', () => {
    const { combined, status } = runCli(['coverage-view', covPath], { cwd: repo, allowFail: true });
    expect(status).toBe(0);
    expect(combined).not.toMatch(/Missing coverage file/i);
    expect(fs.existsSync(path.join(repo, 'coverage.html'))).toBe(true);
  }, 120000);

  /** `--out` took the next argv entry unconditionally, so `--out --watch` wrote a file NAMED `--watch`. */
  it('coverage-view refuses a flag as the value of --out', () => {
    const { combined, status } = runCli(
      ['coverage-view', covPath, '--out', '--watch'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/--out/);
    expect(fs.existsSync(path.join(repo, '--watch'))).toBe(false);
  }, 120000);

  it('coverage-view refuses rather than writing an empty page', () => {
    const out = path.join(repo, 'cov.html');
    const { status } = runCli(['coverage-view', notCov, '--out', out], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
  }, 120000);

  /**
   * A file summary is a LINE fill, not the mean of per-function percentages. `alpha` (4 lines,
   * fully run) and `beta` (4 lines, dark) are equal-sized here, but the weighting must be by span
   * so one covered 3-line helper cannot outvote a dark 300-line function. Measured on conducks
   * itself, `server.ts` read 48% by mean and 80% by line.
   */
  it('coverage-view weights a file summary by span, not by function count', () => {
    const out = path.join(repo, 'cov.html');
    runCli(['coverage-view', covPath, '--out', out], { cwd: repo });
    const html = fs.readFileSync(out, 'utf8');
    expect(html).toMatch(/data-weighted="true"/);
  }, 120000);

  /**
   * Found while measuring `coverage` from `src/`: every command anchored the vault at `cwd`
   * verbatim, so one directory down it MADE a `.conducks/` there and then died printing a raw
   * `DUCKDB_NODEJS_ERROR` object. Creating state on a failed read is worse than the failure —
   * the directory it leaves behind reads as a project on the next run.
   */
  it('finds the project from a subdirectory instead of creating a vault there', () => {
    const sub = path.join(repo, 'src');
    const { combined, status } = runCli(['coverage', covPath, '--json'], { cwd: sub, allowFail: true });
    expect(status).toBe(0);
    expect(combined).not.toMatch(/DUCKDB_NODEJS_ERROR/);
    expect(fs.existsSync(path.join(sub, '.conducks'))).toBe(false);
  }, 120000);

  it('names a missing vault in a sentence rather than dumping a driver object', () => {
    const bare = mkGitRepo('coverage-bare');
    try {
      const { combined, status } = runCli(['status'], { cwd: bare, allowFail: true });
      expect(status).not.toBe(0);
      expect(combined).not.toMatch(/DUCKDB_NODEJS_ERROR|errorType:/);
      expect(combined).toMatch(/analyze/i);
      expect(fs.existsSync(path.join(bare, '.conducks'))).toBe(false);
    } finally {
      rmRepo(bare);
    }
  }, 120000);
});
