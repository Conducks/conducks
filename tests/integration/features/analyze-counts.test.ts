import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0117 — the number a pulse prints is the number the vault holds.
 *
 * `analyze` closed with `Synapse Reflection: N Nodes, M Edges`, where N was `totalNodes` — a running
 * SUM of what each flush wrote. That is not a count of anything a user can ask for, and it was wrong
 * in both directions:
 *
 *   full analyze of a one-file repo   17 Nodes printed, 15 rows in the vault (discovery flush and
 *                                     wave 1 both write the containers; INSERT OR REPLACE)
 *   incremental analyze of conducks   96 Nodes printed, 5,409 rows in the vault — 56x under, because
 *                                     an incremental pulse only flushes what changed
 *
 * The second is the one that matters. A user who analyzes a 5,000-node project and reads "96 Nodes"
 * concludes the analysis failed.
 */
describe('the count a pulse reports is the count the vault holds', () => {
  let repo: string;

  const printedNodes = (out: string): number => {
    const m = out.match(/Synapse Reflection: ([\d,]+) Nodes/);
    if (!m) throw new Error(`no Synapse Reflection line in:\n${out}`);
    return Number(m[1].replace(/,/g, ''));
  };
  const statusNodes = (out: string): number => {
    const m = out.match(/Nodes:\s*([\d,]+)/);
    if (!m) throw new Error(`no node count in status:\n${out}`);
    return Number(m[1].replace(/,/g, ''));
  };

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('analyze-counts');
    writeFile(repo, 'src/a.ts', "import { b } from './b.js';\nexport function a(): number { return b() + 1; }\n");
    writeFile(repo, 'src/b.ts', 'export function b(): number { return 2; }\n');
    writeFile(repo, 'src/c.ts', 'export function c(): number { return 3; }\n');
    commit(repo, 'init');
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('a full pulse reports the vault total, not the sum of what each flush wrote', () => {
    const analyze = runCli(['analyze', '--yes'], { cwd: repo });
    const status = runCli(['status'], { cwd: repo });
    expect(printedNodes(analyze.combined)).toBe(statusNodes(status.combined));
  }, 300000);

  /**
   * The 56x case. An incremental pulse flushes only what changed, so a running sum reports the size
   * of the CHANGE while calling it the size of the project.
   */
  /**
   * `status` ran `graphEngine.resonate()` before reporting — a write-side rebuild on a read path —
   * and then reported the graph it had just mutated. Measured on conducks: 19,528 edges reported
   * against 19,523 rows held, and **every one of the five was DANGLING** — each had at least one
   * endpoint that is not a node. The vault refuses those on save, correctly; the in-memory graph
   * kept them, so the number a user reads was the vault's plus five phantoms.
   *
   * Asserting equality between two independent surfaces is the point: a read command must report
   * what it loaded.
   */
  it('status reports the same edge count the pulse reported', () => {
    // A pulse with nothing to do prints no reflection line at all, and the previous test already
    // analyzed this tree — so give it a real change to react to.
    writeFile(repo, 'src/d.ts', 'export function d(): number { return 9; }\n');
    commit(repo, 'add d');
    const analyze = runCli(['analyze', '--yes'], { cwd: repo });
    const m = analyze.combined.match(/Synapse Reflection: [\d,]+ Nodes, ([\d,]+) Edges/);
    expect(m).toBeTruthy();
    const pulseEdges = Number(m![1].replace(/,/g, ''));
    const status = JSON.parse(runCli(['status', '--json'], { cwd: repo }).stdout);
    expect(status.stats.edgeCount).toBe(pulseEdges);
  }, 300000);

  it('an incremental pulse reports the vault total, not the size of the change', () => {
    writeFile(repo, 'src/c.ts', 'export function c(): number { return 4; }\n');
    commit(repo, 'touch c');
    const analyze = runCli(['analyze', '--yes'], { cwd: repo });
    const status = runCli(['status'], { cwd: repo });
    const printed = printedNodes(analyze.combined);
    const held = statusNodes(status.combined);
    expect(printed).toBe(held);
    // Guards the assertion above against passing because BOTH collapsed to the change size.
    expect(held).toBeGreaterThan(5);
  }, 300000);
});
