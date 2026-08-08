import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A command that walks the graph on an EMPTY vault states the answer instead of leaking the guard.
 *
 * MEASURED before this existed, on a vault emptied by `conducks clean`: `audit`, `prune`, `arch`,
 * `flows` and `diff` all printed the unmaterialised-graph guard verbatim —
 *
 *   🛡️ [Graph] `getAllNodes` read a graph that is not materialised … (todo21#P5)
 *
 * — which is written for whoever is fixing the CALL SITE, not for a user. It names internal
 * functions and a todo, and reads as the tool being broken when the real answer is that nothing has
 * been analyzed.
 *
 * NOTE WHAT THIS IS AND IS NOT (ADR 0145). This is NOT a false-clean: the guard was doing its job,
 * failing loudly with exit 1 rather than answering "nothing" — that is exactly the behaviour ADR 0124
 * asks for, and probing these five is how it was confirmed none of them lie. What was wrong was the
 * PRESENTATION of a correct refusal. The translation therefore lives at the single CLI error
 * boundary rather than in five commands, because it is one shared condition with one correct answer
 * and every future graph-walking command would otherwise have to remember its own copy.
 */
describe('an empty graph produces an answer, not a leaked guard', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('emptygraph');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'eg', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/index.ts', 'export function alpha(): number { return 1; }\nexport function beta(): number { return alpha(); }\n');
    commit(repo, 'a project to empty');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  const GRAPH_WALKERS = ['audit', 'prune', 'arch', 'flows', 'diff'];

  it('all five graph-walking commands work on a populated vault', () => {
    for (const cmd of GRAPH_WALKERS) {
      const r = runCli([cmd], { cwd: repo, allowFail: true });
      expect(`${cmd} exit`).toBe(`${cmd} exit`);
      expect({ cmd, status: r.status }).toEqual({ cmd, status: 0 });
    }
  }, 180000);

  describe('after the vault is emptied', () => {
    beforeAll(() => { runCli(['clean'], { cwd: repo, allowFail: true }); });

    for (const cmd of ['audit', 'prune', 'arch', 'flows']) {
      it(`${cmd} names the empty graph and does not leak the internal guard`, () => {
        const r = runCli([cmd], { cwd: repo, allowFail: true });
        const out = plain(r.combined);

        expect(out).toMatch(/Nothing to check — the structural graph is empty/);
        expect(out).toMatch(/conducks analyze/);
        // The parts written for a maintainer, not a user.
        expect(out).not.toMatch(/getAllNodes/);
        expect(out).not.toMatch(/todo21/);
        expect(out).not.toMatch(/ensureGraphLoaded/);
        // Nothing analyzed is NOT a pass — a script must not read it as one (ADR 0124).
        expect(r.status).not.toBe(0);
      });
    }

    it('diff only reaches the graph when something CHANGED — and then it answers too', () => {
      // Subtlety worth stating rather than papering over: with no changed files `diff` short-circuits
      // before it ever touches the graph, so it prints "no structural changes" on an empty vault and
      // that is CORRECT — its denominator genuinely was zero files, not zero symbols. The empty-graph
      // answer is reachable only once there is something to compare.
      const clean = plain(runCli(['diff'], { cwd: repo, allowFail: true }).combined);
      expect(clean).toMatch(/no structural changes/i);
      expect(clean).not.toMatch(/getAllNodes|todo21/);

      writeFile(repo, 'src/added.ts', 'export function gamma(): number { return 3; }\n');
      const changed = runCli(['diff'], { cwd: repo, allowFail: true });
      const out = plain(changed.combined);
      expect(out).toMatch(/Nothing to check — the structural graph is empty/);
      expect(out).not.toMatch(/getAllNodes|todo21/);
      expect(changed.status).not.toBe(0);
    });

    it('--verbose still exposes the internal guard for whoever is debugging it', () => {
      // The detail is moved out of the default output, not destroyed.
      const out = plain(runCli(['audit', '--verbose'], { cwd: repo, allowFail: true }).combined);
      expect(out).toMatch(/getAllNodes|not materialised/);
    });

    it('an UNRELATED failure is still reported as an execution error', () => {
      // The translation must be narrow: it keys on the one condition, and everything else keeps the
      // message it had. A catch-all here would hide real faults behind "run analyze".
      const out = plain(runCli(['resonance', '/nonexistent/path/nope.ts'], { cwd: repo, allowFail: true }).combined);
      expect(out).not.toMatch(/Nothing to check/);
      expect(out).toMatch(/does not exist|Error/);
    });
  });
});
