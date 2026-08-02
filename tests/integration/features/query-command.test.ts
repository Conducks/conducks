import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0102 — `conducks query` scored against expected answers written before it was run.
 *
 * Twelve cases were derived by reading `query.ts`, `intelligence/index.ts` and `search-engine.ts`
 * and committed to `CONDUCKS/oracle/EXPECTED-QUERY.md` BEFORE the command ran once. Eight passed.
 * The four that failed were all predicted from the source, and are the four pinned here.
 *
 * One prediction was wrong, in the useful direction: `properties.rank` was expected to be undefined
 * on a shallow load, making the "Kinetic Gravity Multiplier" a constant 1. It is recomputed live by
 * `StructuralRanker.calculateGravity` when the graph loads, so the multiplier is real. Reading the
 * persistence layer alone was not enough to know that.
 */
describe('query — the four defects the oracle found', () => {
  let repo: string;

  const json = (args: string[]) => JSON.parse(runCli(['query', ...args, '--json'], { cwd: repo }).stdout);

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('query-cmd');
    // `logAudit` with several callers reproduces the echo-flood: the callers match nothing, but
    // inherit resonance from the node that does.
    writeFile(repo, 'src/audit.ts', `export function logAudit(event: string): void { void event; }\n`);
    for (let i = 1; i <= 6; i++) {
      writeFile(repo, `src/caller${i}.ts`,
        `import { logAudit } from './audit.js';\nexport function action${i}(): void { logAudit('a${i}'); }\n`);
    }
    writeFile(repo, 'src/extra.ts', `
export function alpha(): number { return 1; }
export function beta(): number { return 2; }
export function gamma(): number { return 3; }
export class Delta { run(): string { return 'd'; } }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  /**
   * Q06/Q07. `--limit` was parsed into a local and never passed to the search, so every fuzzy
   * query returned `IntelligenceService.query`'s default of 10 — `--limit 3` gave 10 rows and
   * `--limit 50` also gave 10.
   */
  it('honours --limit in both directions', () => {
    expect(json(['*', '--limit', '3'])).toHaveLength(3);
    const wide = json(['*', '--limit', '50']);
    expect(wide.length).toBeGreaterThan(10);
  });

  /**
   * Q12. The argument filter compared each token by VALUE against the mode, template, filter and
   * limit — so a search term equal to any of them was deleted. `query fuzzy` matched the DEFAULT
   * mode, left an empty query, and an empty query is read as `*`: asking for a symbol named
   * `fuzzy` returned the entire inventory.
   */
  it('searches for a term that happens to equal a flag value', () => {
    expect(json(['fuzzy'])).toHaveLength(0);
    expect(json(['filter'])).toHaveLength(0);
    // The same shape with a number, against the default limit of 10.
    expect(json(['10'])).toHaveLength(0);
  });

  /**
   * Q11. Wavefront propagation gives every caller 50% of a matching node's score, three hops deep,
   * and those callers entered the result set indistinguishable from real matches. On the oracle
   * fixture SIX of ten slots for `query logAudit` went to `action1`..`action6`, none of which
   * contain the string searched for.
   *
   * The echo is kept — the callers of what you searched for are usually what you want next — but it
   * may not displace a direct match, and it may not pretend to be one.
   */
  it('never lets an echo displace or impersonate a direct match', () => {
    const rows = json(['logAudit']);

    // Every row claiming to be a direct match really contains the term.
    for (const r of rows.filter((r: { match: string }) => r.match === 'direct')) {
      expect(String(r.name).toLowerCase()).toContain('logaudit');
    }

    // The exact match is first, and is direct.
    expect(rows[0].name).toBe('logAudit');
    expect(rows[0].match).toBe('direct');

    // The callers are still present — and labelled.
    const echoes = rows.filter((r: { match: string }) => r.match === 'echo');
    expect(echoes.length).toBeGreaterThan(0);
    for (const e of echoes) expect(String(e.name).toLowerCase()).not.toContain('logaudit');
  });

  /** The cases that already passed, kept so a fix cannot quietly break them. */
  it('finds what exists and refuses what does not', () => {
    expect(json(['alpha'])[0].name).toBe('alpha');
    expect(json(['Delta'])[0].name).toBe('Delta');
    expect(json(['zzzNoSuchSymbolAnywhere'])).toHaveLength(0);
  });

  it('the inventory excludes containers and carries a real rank', () => {
    const rows = json(['*', '--limit', '25']);
    for (const r of rows) {
      expect(['ECOSYSTEM', 'REPOSITORY', 'DIRECTORY']).not.toContain(r.kind);
      expect(r.rank).not.toBeNull();
      expect(r.rank).not.toBeUndefined();
    }
  });
});
