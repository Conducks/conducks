import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `import * as headers from './headers'` bound NOTHING. Named imports and default imports each had a
 * per-binding capture; the namespace form had none, so `headers.withSecurityHeaders(handler)` never
 * resolved and the function it calls was reported dead.
 *
 * Measured on the orchestrator subject (todo77#P1, the L1 baseline for `prune`): 8 of 175 verdicts
 * were this — `withSecurityHeaders`, `withRateLimit`, `withInputValidation`, `trackPageView`,
 * `trackAction`, `startLLMRequest`, `completeLLMRequest`, `logLLMRequest`, every one of them called
 * through a namespace alias in the barrel beside it. `impact upstream` on the first agreed: **0
 * callers, examined 27,277 edges**. Rounds 5 and 6 hand-checked roughly 40 of ~400 findings and the
 * sample missed all 8, which is how "prune has zero false positives" survived two rounds.
 *
 * Sofie and scraper hold zero namespace imports, so the defect was invisible on two of three
 * subjects — the monorepo is the only place a barrel re-exporting its siblings is idiomatic.
 */
describe('a namespace import binds its members', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('namespace-import');

    // The real shape from the subject: a leaf module, and a barrel that namespace-imports it and
    // re-publishes one of its functions through a wrapper object.
    //
    // The leaf function is named DIFFERENTLY from the wrapper method on purpose. Written with both
    // called `withSecurityHeaders` — which is how the subject actually spells it — the intra-linker
    // bound the call by NAME to the wrapper sitting in the same file, and the prune assertion passed
    // against the unfixed build. The fixture had quietly removed the only variable under test.
    writeFile(repo, 'src/headers.ts', `
export function applySecurityHeaders(h: string): string { return h + '-secured'; }
export function readAsValue(h: string): string { return h + '-value'; }
export function neverReferenced(h: string): string { return h + '-unused'; }
`);
    // An imported const TABLE — a binding, but not a namespace. This is the case the gate exists
    // for: resolveLocalBinding finds a path for it just as it does for a namespace alias, so an
    // ungated member rule would mint src/config.ts::apply, a symbol that does not exist.
    writeFile(repo, 'src/config.ts', `
export const CONFIG = { apply: 1, retries: 3 };
`);
    writeFile(repo, 'src/index.ts', `
import * as headers from './headers.js';
import { CONFIG } from './config.js';

export const retries = CONFIG.retries;

// A local object whose property happens to share a name with a DEAD export in headers.ts. The
// member-read rule must not resolve this one: table is not a namespace, so its property is not
// a symbol, and treating it as one would rescue neverReferenced and hide a real finding.
const table = { neverReferenced: 1 };
export const tableSize = Object.keys(table).length + table.neverReferenced;

export const SecurityManager = {
  withSecurityHeaders(h: string): string {
    return headers.applySecurityHeaders(h);
  },
  // READ as a value, never called — the shape that survived the first fix. A typeof or an
  // object-literal value produces no call, so only a member-READ rule reaches them.
  valueRef: headers.readAsValue,
};
`);
    writeFile(repo, 'src/main.ts', `
import { SecurityManager } from './index.js';
export function boot(): string { return SecurityManager.withSecurityHeaders('x'); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does NOT report a namespace-called function as dead', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const dead = findings
      .filter((f: any) => f.claim !== 'question')
      .map((f: any) => f.symbol);
    expect(dead).not.toContain('applySecurityHeaders');
  }, 180000);

  it('impact finds the namespace call site as a caller', () => {
    const out = runCli(
      ['impact', 'src/headers.ts::applySecurityHeaders', 'upstream', '--json'],
      { cwd: repo, allowFail: true }
    ).stdout;
    const parsed = JSON.parse(out);
    const paths = (parsed.affectedNodes ?? []).map((n: any) => n.id).join(' ');
    expect(paths).toContain('index.ts');
  }, 180000);

  /**
   * The gate's own counter-case. `CONFIG.retries` is a member read off an IMPORTED binding that is
   * not a namespace, so the binding resolves to a path exactly as an alias does. Ungated, the rule
   * mints `src/config.ts::retries` — a target no node is keyed by, which is the dangling-edge shape
   * ADR 0140's audit check reports as an edge to a node that does not exist.
   *
   * Written after the first version of this suite passed with the gate REMOVED: the counter-case
   * then used a LOCAL object, which never enters the binding map at all, so the `!nsPath` guard
   * caught it and the gate was never the thing under test.
   */
  it('does not fabricate a member id for an imported binding that is not a namespace', () => {
    const out = runCli(['audit'], { cwd: repo, allowFail: true }).combined;
    expect(out).not.toContain('config.ts::retries');
  }, 180000);

  it('does NOT report a namespace member READ as dead, though nothing calls it', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const dead = findings.filter((f: any) => f.claim !== 'question').map((f: any) => f.symbol);
    expect(dead).not.toContain('readAsValue');
  }, 180000);

  /**
   * THE COUNTER-CASE, and the reason this is two tests rather than one. A fix that registers the
   * alias but resolves every member optimistically would make the first assertion pass by making
   * `prune` blind — `neverReferenced` is exported from the same file reached by the same alias and
   * is touched by nothing. It must still be reported, or the fix bought its pass by turning the
   * detector off.
   */
  it('still reports an export of the SAME module that the namespace never accesses', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const dead = findings
      .filter((f: any) => f.claim !== 'question')
      .map((f: any) => f.symbol);
    expect(dead).toContain('neverReferenced');
  }, 180000);
});
