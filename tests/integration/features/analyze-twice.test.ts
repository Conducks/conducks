import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0101 — running `analyze` a second time must not destroy the graph.
 *
 * `sweepRowsNotInPulse` deletes every row whose `pulseId` is not the current one. That is correct
 * for a FULL pass, which re-stamps everything. An INCREMENTAL pass re-stamps only the dirty units,
 * so every untouched row read as "left by an earlier pulse" and was deleted. Measured on this
 * repository: **5,221 nodes -> 217** after a second run with one file changed, and reproduced
 * identically on the preceding commit, so it was not a regression — it had always been there.
 *
 * Nothing caught it, and the reason is the whole point of this file: every existing test analyzes
 * ONCE. A cold vault is the one state in which the bug cannot appear, and it was the only state
 * ever measured. The most ordinary way to use the tool — edit a file, re-run — was the untested
 * path.
 *
 * These tests are deliberately about SURVIVAL rather than exact counts. A count assertion here
 * would be brittle for the wrong reason; the property that matters is that the graph is still the
 * graph.
 */
describe('analyze is idempotent — a second pulse keeps the graph', () => {
  let repo: string;

  const stats = () => {
    const { stdout } = runCli(['status', '--json'], { cwd: repo });
    const s = JSON.parse(stdout);
    return { nodes: Number(s.stats.nodeCount), edges: Number(s.stats.edgeCount) };
  };

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('analyze-twice');
    writeFile(repo, 'src/a.ts', `
import { helper } from './b.js';
export function callsHelper(n: number): number { return helper(n) + 1; }
`);
    writeFile(repo, 'src/b.ts', `
export function helper(n: number): number { return n * 2; }
`);
    writeFile(repo, 'src/c.ts', `
export class Untouched { run(): string { return 'c'; } }
`);
    commit(repo, 'init');
  });

  afterAll(() => rmRepo(repo));

  it('a second run with NOTHING changed keeps every node', () => {
    runCli(['analyze', '--yes'], { cwd: repo });
    const first = stats();
    expect(first.nodes).toBeGreaterThan(0);

    runCli(['analyze', '--yes'], { cwd: repo });
    const second = stats();

    expect(second.nodes).toBe(first.nodes);
    expect(second.edges).toBe(first.edges);
  });

  /**
   * The real shape of the bug: ONE file changes, and the other files' symbols must survive. This is
   * where the old behaviour collapsed the graph to just the re-analyzed unit.
   */
  it('a second run with ONE file changed keeps the other files\' symbols', () => {
    runCli(['analyze', '--yes'], { cwd: repo });
    const before = stats();

    writeFile(repo, 'src/a.ts', `
import { helper } from './b.js';
export function callsHelper(n: number): number { return helper(n) + 2; }
export function addedLater(): string { return 'new'; }
`);
    runCli(['analyze', '--yes'], { cwd: repo });
    const after = stats();

    // The graph grew by the new function; it did not collapse to the single dirty unit.
    expect(after.nodes).toBeGreaterThanOrEqual(before.nodes);

    // The untouched file's class is still answerable — the assertion that actually failed before.
    const { stdout } = runCli(['query', 'Untouched', '--json'], { cwd: repo });
    expect(JSON.parse(stdout).length).toBeGreaterThan(0);

    // And so is the untouched dependency of the file that DID change.
    const { stdout: h } = runCli(['query', 'helper', '--json'], { cwd: repo });
    expect(JSON.parse(h).length).toBeGreaterThan(0);
  });

  /**
   * ADR 0107 — an incremental pulse must produce the SAME EDGES as a cold one.
   *
   * Import specifiers are resolved against the list of files the pulse knows about, and that list
   * was built from the DIRTY set. On a cold run every file is dirty so it is complete; on an
   * incremental run the file being imported FROM is absent, so `'./b.js'` resolved to nothing and
   * the per-binding IMPORTS edge was never created.
   *
   * It hid well: the CALLS edge still appears, because IntraLinker runs afterwards against the
   * persisted graph. So the graph looked linked while its import edges were missing — and `rename`,
   * which locates edit sites from those edges, rewrote a call and left the import behind.
   */
  it('a file added incrementally gets its import edges, not just its calls', () => {
    writeFile(repo, 'src/late.ts',
      "import { helper } from './b.js';\nexport function late(n: number): number { return helper(n); }\n");
    runCli(['analyze', '--yes'], { cwd: repo });

    // `impact helper --direction upstream` walks incoming edges; the new importer must appear.
    const { stdout } = runCli(['query', 'late', '--json'], { cwd: repo });
    expect(JSON.parse(stdout).length).toBeGreaterThan(0);

    // The rename tool is the strictest reader of import edges: it must find and rewrite the import.
    runCli(['rename', `${repo}/src/b.ts::helper`, 'assist', '--confirm'], { cwd: repo });
    const late = fs.readFileSync(path.join(repo, 'src/late.ts'), 'utf-8');
    expect(late).toContain("import { assist }");
    expect(late).toContain('assist(n)');
  }, 300000);

  /**
   * The sweep still has to work where it is correct. A DELETED file's symbols must not survive —
   * that path is the vault-reconcile block, not the pulse sweep, and gating the sweep must not have
   * quietly disabled it.
   */
  it('a deleted file\'s symbols do not survive the next pulse', () => {
    writeFile(repo, 'src/doomed.ts', `export function willVanish(): number { return 42; }\n`);
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout: present } = runCli(['query', 'willVanish', '--json'], { cwd: repo });
    expect(JSON.parse(present).length).toBeGreaterThan(0);

    fs.rmSync(path.join(repo, 'src/doomed.ts'));
    runCli(['analyze', '--yes'], { cwd: repo });

    const { stdout: gone } = runCli(['query', 'willVanish', '--json'], { cwd: repo });
    expect(JSON.parse(gone).length).toBe(0);
  });
});
