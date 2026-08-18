import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * An edge must leave from a node that exists. Two shapes broke that, and `audit` caught both —
 * correctly — as "Edge from a node that does not exist".
 *
 * **Siblings on one line.** `{ debug() {}, info() {}, warn() {}, error() {} }` puts four scopes on
 * one row. The scope lookup filtered by ROW only, so each method "enclosed" positions inside its
 * siblings and the chain came out as `debug.info.warn.error` — a name no node carries. Every edge
 * emitted from inside those methods then had a phantom source. MEASURED: 34 such edges on the sofie
 * subject, 2 on scraper. This is the same one-row ambiguity todo25 fixed for declarations by
 * comparing spans; a reference has no span, but it has a POSITION, and containment by position is
 * exact.
 *
 * **A class declared inside a function.** `class MappedListLevel(MappedLevel)` written inside a
 * method to dodge a circular import carries its enclosing scope in its node id, while its `EXTENDS`
 * edge was built from the bare name. Same defect the alias branch fixed under todo62.
 *
 * After both: **0 dangling edge sources on all three subjects**, with node counts and every `prune`
 * output unchanged.
 */
describe('an edge leaves from a node that exists', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('scope-position');

    writeFile(repo, 'src/logger.ts', `
export interface Log { debug(m: string): void; info(m: string): void; warn(m: string): void; error(m: string): void }
export function target(): number { return 1; }

/** FOUR SCOPES ON ONE ROW — the shape that produced \`debug.info.warn.error\`. */
export function makeLogger(): Log {
  const sink: string[] = [];
  return { debug() { target(); }, info() { sink.push('i'); }, warn() {}, error(m: string) { sink.push(m); } };
}
`);
    writeFile(repo, 'src/nested.py', `
class BaseThing:
    def run(self):
        return 1

def build():
    # A class declared INSIDE a function, as a circular-import dodge.
    class InnerThing(BaseThing):
        def run(self):
            return 2
    return InnerThing
`);
    writeFile(repo, 'src/main.ts', `
import { makeLogger } from './logger.js';
export function boot(): void { makeLogger().debug('x'); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('audit reports no edge from a non-existent node', () => {
    const out = runCli(['audit'], { cwd: repo, allowFail: true }).combined;
    expect(out).not.toContain('Edge from a node that does not exist');
  }, 180000);

  it('does not invent a scope name by joining siblings that share a line', () => {
    const symbols = JSON.stringify(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout));
    expect(symbols).not.toContain('debug.info');
    expect(symbols).not.toContain('info.warn');
  }, 180000);

  it('still records the call made inside one of those one-line methods', () => {
    // The counter-test. Dropping the scope entirely would also remove the phantom, and would lose
    // the edge with it — the point is that the call is attributed to a REAL source.
    const impact = JSON.parse(runCli(['impact', 'target', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
  }, 180000);
});
