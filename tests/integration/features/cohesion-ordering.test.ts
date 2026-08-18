import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `cohesion` claims to measure structural similarity. On the scraper subject it ORDERED TWO PAIRS
 * BACKWARDS: `Clusterer._calculate_complexity` vs `Clusterer._check_spatial_consistency` — same
 * class, both called from `cluster()` — scored **17.39%**, while `_calculate_complexity` vs
 * `validators.validate_phone`, a different package with no relationship at all, scored **21.43%**.
 *
 * Reading the neighbour sets from the vault gave both causes, and neither is subtle:
 *
 *   - The unrelated pair's ENTIRE overlap was `global::str`, `global::re`, `global::len`. Every
 *     Python function calls `len`, so counting built-ins as evidence makes all functions alike.
 *   - Each symbol's own LOCAL VARIABLES sat in the union and could never intersect, so the
 *     denominator grew with the size of the function — penalising the larger one for being larger.
 *
 * A metric that ranks the unrelated pair above the related one is not measuring what it names.
 */
describe('cohesion ranks a related pair above an unrelated one', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('cohesion-ordering');

    writeFile(repo, 'src/shared.py', `
class Engine:
    """The rare, meaningful neighbour: only the related pair touches it."""
    def start(self):
        return 1
`);
    // TWO METHODS OF ONE CLASS, both reaching the same project symbol.
    writeFile(repo, 'src/cluster.py', `
from shared import Engine

class Clusterer:
    def alpha(self, items):
        engine = Engine()
        sizes = [len(str(i)) for i in items]
        return min(sizes) + engine.start()

    def beta(self, items):
        engine = Engine()
        widths = [len(str(i)) for i in items]
        return max(widths) + engine.start()
`);
    // A FUNCTION IN ANOTHER PACKAGE that shares only built-ins with the pair above.
    writeFile(repo, 'src/validate.py', `
def validate_phone(text):
    digits = [c for c in str(text) if c.isdigit()]
    return len(digits) > 6, min(len(digits), 15)
`);
    writeFile(repo, 'main.py', `
from cluster import Clusterer
from validate import validate_phone

def run(items, phone):
    c = Clusterer()
    return c.alpha(items), c.beta(items), validate_phone(phone)
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 180000);

  afterAll(() => rmRepo(repo));

  const plain = (s: string): string => s.replace(/\[[0-9;]*m/g, '');
  const similarity = (a: string, b: string): number => {
    const out = plain(runCli(['cohesion', a, b], { cwd: repo }).stdout);
    const m = /Similarity:\s*([\d.]+)%/.exec(out);
    return m ? Number(m[1]) : NaN;
  };

  it('scores the same-class pair above the cross-package pair', () => {
    const related = similarity('alpha', 'beta');
    const unrelated = similarity('alpha', 'validate_phone');
    expect(Number.isNaN(related)).toBe(false);
    expect(Number.isNaN(unrelated)).toBe(false);
    expect(related).toBeGreaterThan(unrelated);
  }, 180000);

  it('does not credit shared built-ins as similarity', () => {
    // `alpha` and `validate_phone` share `len`, `str` and `min` and nothing else. That must not
    // register as kinship — the specific defect this test exists for.
    expect(similarity('alpha', 'validate_phone')).toBe(0);
  }, 180000);
});
