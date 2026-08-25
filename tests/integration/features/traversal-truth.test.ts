import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The traversal commands, against a fixture whose every edge is written by hand (todo50 Phase 2).
 *
 * `impact`, `trace` and `context` all answer plausibly on any repository — which is precisely why
 * they need a fixture with a KNOWN answer. Every defect this walk has found lived in output that
 * looked reasonable: a test file ranked top hotspot, an inventory ordered by its own rule, a scoped
 * pulse reporting success. "It printed a sensible-looking list" is not evidence.
 *
 * The shape below is chosen so each command has exactly one right answer and several tempting wrong
 * ones:
 *
 *   main.ts::run      calls  service.ts::fetchUser
 *   service.ts::fetchUser  calls  util.ts::format
 *   util.ts::format   calls  nothing
 *   service.ts::orphanHelper   is called by nobody, and SHARES service.ts with fetchUser
 *   util.ts::unusedFormat      is called by nobody, and shares util.ts with format
 *
 * So: `impact format` upstream must reach fetchUser and run, and must NOT reach `orphanHelper` or
 * `unusedFormat` — both are reachable only by walking INTO a file and back out, which is
 * co-location, not dependency (ADR 0129). And `trace run` downstream must reach format without
 * reporting the files, directories or the repository itself as steps (todo38).
 */
describe('traversal answers against a hand-derived fixture', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('traversal');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'trav', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/util.ts', `
export function format(n: number): string { return String(n); }
export function unusedFormat(n: number): string { return String(n * 2); }
`);
    writeFile(repo, 'src/service.ts', `
import { format } from './util.js';
export function fetchUser(id: number): string { return format(id); }
export function orphanHelper(x: number): number { return x + 1; }
`);
    writeFile(repo, 'src/widget.ts', `
/** A CLASS: constructed, never called — the shape whose users context used to omit. */
export class Widget { value = 1; }
`);
    // A VALUE, not a function. Its consumers import it and read a property; nothing "calls" it, so
    // the only evidence of a user is the IMPORTS edge on the importing FILE.
    writeFile(repo, 'src/db/manager.ts', `
export const coreDb = { open: true };
`);
    // The REAL shape, from the orchestrator subject: a barrel re-exporting under a different name.
    // A direct import gives the consuming SYMBOL an ACCESSES edge, which the use-edge set already
    // admits; reaching the alias leaves only an IMPORTS edge on the consuming FILE. A first draft of
    // this fixture imported directly, and every case passed without the fix.
    writeFile(repo, 'src/db/index.ts', `
export { coreDb as db } from './manager.js';
`);
    writeFile(repo, 'src/consumer.ts', `
import { db } from './db/index.js';
export function isOpen(): boolean { return db.open; }
`);
    writeFile(repo, 'src/main.ts', `
import { fetchUser } from './service.js';
import { Widget } from './widget.js';
export function run(): string { return fetchUser(1); }
export function useWidget(): number { return new Widget().value; }
`);
    commit(repo, 'a chain with two orphans sharing files with it');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  const namesIn = (out: string): string[] => {
    const wanted = ['run', 'fetchuser', 'format', 'orphanhelper', 'unusedformat'];
    return wanted.filter(n => new RegExp(`\\b${n}\\b`, 'i').test(out)).sort();
  };

  it('impact upstream reaches the real callers and NOT the file-sharing orphans', () => {
    const out = runCli(['impact', 'format', '--json'], { cwd: repo }).stdout;
    const found = namesIn(out);
    expect(found).toContain('fetchuser');   // direct caller
    expect(found).toContain('run');         // indirect caller
    // The two orphans are reachable ONLY through a shared file. Co-location is not impact.
    expect(found).not.toContain('orphanhelper');
    expect(found).not.toContain('unusedformat');
  });

  it('trace downstream reaches the chain and reports no containers as steps', () => {
    const out = runCli(['trace', 'run'], { cwd: repo }).stdout;
    expect(out).toMatch(/fetchuser/i);
    expect(out).toMatch(/format/i);
    // A UNIT, DIRECTORY or REPOSITORY appearing as a step is the containment ladder (todo38).
    expect(out).not.toMatch(/\bDIRECTORY\b|\bREPOSITORY\b|\bECOSYSTEM\b/);
  });

  it('context names the callers of a symbol, which is the half it used to omit', () => {
    const out = runCli(['context', 'fetchUser'], { cwd: repo }).stdout;
    expect(out).toMatch(/Called by/i);
    expect(out).toMatch(/\brun\b/i);
  });

  it('names the users of a CLASS, which is constructed rather than called', () => {
    // The section accepted `CALLS` alone, so for every class it vanished silently. MEASURED on the
    // scraper subject: `impact Hands upstream` reported 153 affected symbols with exact call sites
    // while `context Hands` printed no caller section — two commands, one graph, opposite answers to
    // "who uses this".
    const out = runCli(['context', 'Widget'], { cwd: repo, allowFail: true }).combined;
    expect(out).toMatch(/Called by/i);
    expect(out.toLowerCase()).toContain('usewidget');
  });

  /**
   * A VALUE has no callers, and answering "no users" about one that 103 files import is the same
   * defect this file already fixed twice — first for CALLS-only omitting classes, then for the
   * weighted-depth argument excluding constructions.
   *
   * MEASURED on the orchestrator subject: `db` (`export { coreDb as db }`) is that project's #1
   * hotspot. `impact db upstream` reports 212 affected symbols, 103 of them direct with path
   * `['IMPORTS']` — and `context db` printed no caller section at all, because IMPORTS is not in the
   * use-edge set. Every one of those 103 is a FILE node, which is why this is a fallback and not a
   * widening: adding IMPORTS unconditionally would have put 78 redundant file rows beside
   * `ensureServerInitialized`'s 98 real symbol callers on the same subject.
   */
  it('names the importing files of a VALUE, which has no callers at all', () => {
    const out = runCli(['context', 'src/db/index.ts::db'], { cwd: repo }).combined;
    expect(out).toContain('Called by / used by');
    expect(out).toContain('consumer.ts');
  }, 180000);

  it('does not add file rows when a symbol already has real callers', () => {
    // The counter-case. `format` is called by `fetchUser`, and `service.ts` also imports it — the
    // file row is the same fact one level up, so it must not appear beside the caller.
    const out = runCli(['context', 'src/util.ts::format'], { cwd: repo }).combined;
    const block = out.split('Called by / used by')[1]?.split('In radius')[0] ?? '';
    expect(block).toContain('fetchUser');
    expect(block).not.toMatch(/service\.ts\s*\(/);
  }, 180000);

  it('impact on an UNCALLED symbol answers zero with its basis, never a bare zero', () => {
    const out = runCli(['impact', 'orphanHelper'], { cwd: repo }).combined;
    // A true zero must state what it EXAMINED (edges seen, unresolved count, same-name check), so
    // it cannot be read as a broken zero — the distinction todo44#P6 was written for. The exact
    // wording is asserted because this test first failed on a regex I had guessed rather than read:
    // the command says "0 Symbols affected", and the basis line was there all along.
    expect(out).toMatch(/0 Symbols affected/i);
    expect(out).toMatch(/examined \d+ edges/i);
    expect(out).toMatch(/unresolved reference/i);
    expect(out).toMatch(/no caller exists in what was analyzed/i);
  });
});
