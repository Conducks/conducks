import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * AN ID A COMMAND PRINTS MUST BE AN ID ITS SIBLINGS ACCEPT.
 *
 * `status` prints ids lowercased (they are lowercased on write, CONDUCKS-4) and prints member ids in
 * dotted form. Both shapes were unresolvable:
 *
 *   - `src/core/service/hands.py::hands` — the class is `Hands`, and resolution fell through to a
 *     NAME lookup keyed by the real spelling, whose case-insensitive fallback is a substring scan
 *     capped at 20 hits that can return none of them in the right file.
 *   - `src/core/mapper/mapper_runner.py::mapperrunner.explore` — no node is NAMED
 *     `mapperrunner.explore`; the name is `explore` and the rest is the id's own qualifier.
 *
 * MEASURED on the scraper subject: `status` printed both, and `trace`, `explain` and `entropy`
 * answered SYMBOL_NOT_FOUND for both — while accepting the equivalent id on the sofie subject, whose
 * top symbol happens to be lowercase already. So the failure was invisible on two of three projects.
 *
 * Resolution now matches the input as an ID when it is shaped like one, which is what it is.
 */
describe('an id printed by status resolves in every command that takes one', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('printed-id-roundtrip');

    writeFile(repo, 'src/service.py', `
class Hands:
    """CamelCase on purpose: the id prints lowercased and must still resolve."""
    def explore(self, target):
        return self.probe(target)

    def probe(self, target):
        return target
`);
    writeFile(repo, 'main.py', `
from service import Hands

def run(target):
    return Hands().explore(target)
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  const notFound = (s: string) => /not found|SYMBOL_NOT_FOUND/i.test(s);

  it('every id status prints is accepted by explain, entropy, trace and impact', () => {
    const status = runCli(['status'], { cwd: repo }).stdout;
    const ids = status
      .split('\n')
      .filter(l => /^\s*\d+\.\s/.test(l))
      .map(l => l.replace(/^\s*\d+\.\s*/, '').replace(/\s*\[Gravity.*$/, '').replace(/\[[0-9;]*m/g, '').trim())
      .filter(Boolean);

    expect(ids.length).toBeGreaterThan(0);   // otherwise this test asserts nothing

    for (const id of ids) {
      for (const argv of [['explain', id], ['entropy', id], ['trace', id], ['impact', id, 'upstream']]) {
        const { combined } = runCli(argv, { cwd: repo, allowFail: true });
        expect({ id, cmd: argv[0], notFound: notFound(combined) }).toEqual({ id, cmd: argv[0], notFound: false });
      }
    }
  }, 300000);

  it('resolves a lowercased id whose symbol is CamelCase', () => {
    const out = runCli(['explain', 'src/service.py::hands'], { cwd: repo, allowFail: true }).combined;
    expect(notFound(out)).toBe(false);
    expect(out).toContain('Hands');
  }, 180000);

  it('resolves a dotted member id', () => {
    const out = runCli(['explain', 'src/service.py::hands.explore'], { cwd: repo, allowFail: true }).combined;
    expect(notFound(out)).toBe(false);
    expect(out.toLowerCase()).toContain('explore');
  }, 180000);

  it('still refuses a path that holds no such symbol', () => {
    // The counter-test, and a documented rule (ADR 0106): a qualifier that does not hold the name is
    // a MISS, not a licence to answer with the highest-gravity symbol of that name somewhere else.
    const out = runCli(['explain', 'src/does/not/exist.py::hands'], { cwd: repo, allowFail: true }).combined;
    expect(notFound(out)).toBe(true);
  }, 180000);
});
