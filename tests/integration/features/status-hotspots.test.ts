import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * "Top Structural Hotspots" is captioned as a list of the symbols that carry a codebase. It was
 * ranking every node in the graph, and containers rank high by construction — a file node inherits
 * the gravity of everything inside it.
 *
 * MEASURED on the subjects: sofie's #4 was `src/services/voice/daemon/daemon.py::unit`, printed in
 * exactly the shape of a symbol id, for which `grep -ni unit daemon.py` returns nothing — it is the
 * FILE node wearing a `::unit` suffix. The orchestrator's #3 was `app/src/lib/bootstrap.ts::unit`
 * and its #5 was `ecosystem::vitest` — a test-runner dependency presented as one of the five most
 * structurally important things in the repository. Two of five rows were not code.
 */
describe('status hotspots are symbols, not files or dependencies', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('status-hotspots');

    writeFile(repo, 'package.json', JSON.stringify({ name: 'h', dependencies: { zod: '^3.0.0' } }, null, 2));
    writeFile(repo, 'src/core.ts', `
import { z } from 'zod';

/** The hub every other module reaches — the symbol a hotspot list should be about. */
export function coreHub(n: number): number { return z.number().parse(n); }
export function helperA(): number { return coreHub(1); }
export function helperB(): number { return coreHub(2); }
export function helperC(): number { return coreHub(3); }
`);
    writeFile(repo, 'src/main.ts', `
import { coreHub, helperA, helperB, helperC } from './core.js';
export function boot(): number { return coreHub(0) + helperA() + helperB() + helperC(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('lists no file-unit node and no dependency node among the hotspots', () => {
    const out = runCli(['status'], { cwd: repo }).stdout;
    const section = out.slice(out.indexOf('Top Structural Hotspots'));
    expect(section).not.toContain('::unit');
    expect(section).not.toContain('ecosystem::');
    expect(section).not.toContain('directory::');
  }, 180000);

  it('still lists real symbols', () => {
    // The counter-test: filtering everything out would pass the assertion above and leave an empty
    // list, which the command would then print under a heading as if it were an answer.
    const out = runCli(['status'], { cwd: repo }).stdout;
    const section = out.slice(out.indexOf('Top Structural Hotspots'));
    expect(section.toLowerCase()).toContain('corehub');
  }, 180000);
});
