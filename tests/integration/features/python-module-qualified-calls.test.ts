import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A MODULE-QUALIFIED Python call — `from pkg import mod` then `mod.fn(...)` — must produce a real
 * edge, and `.apply` must not be swept as a JavaScript built-in.
 *
 * Two defects, one symptom, both measured on the scraper subject before this test existed:
 *
 *  1. The universal-member sweep is written for JavaScript, where `apply` is `Function.prototype.apply`
 *     and no project declares it. In Python `apply` is an ordinary module-level function name, and
 *     `stealth/{consistency,fingerprint,hardware_emulation,navigator_patch}.py` each declare one.
 *     The sweep deleted all eight call edges from `browser/engine.py:117-120` and `:243-246`, and
 *     `prune` then reported the four live anti-detection functions as ORPHAN — a delete verdict on
 *     working code, corroborated by `impact` reporting 0 callers for the same reason.
 *
 *  2. The surviving shape `pkg/__init__.py::mod.fn` LOOKS like a resolved id (it carries a path
 *     separator) while naming no node, so the linker's "already resolved" guard skipped it and no
 *     resolution block ever ran. `paths.get_project_root()`, called from three files, had 0 callers.
 *
 * Driven through a real `analyze` rather than a hand-built graph, for the reason
 * `scope-shadowing.test.ts` gives: a hand-built graph freezes the producer's shape at the moment the
 * test was written, and this bug lives in the seam between producer and linker.
 */
describe('python module-qualified calls resolve, and `.apply` is not a JS built-in there', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('py-module-qualified');

    writeFile(repo, 'pkg/__init__.py', '');
    writeFile(repo, 'pkg/sub/__init__.py', '');
    writeFile(repo, 'pkg/sub/stealth_patch.py', `
async def apply(ctx, region=None):
    """Named \`apply\` on purpose — the JS sweep used to delete every call to this."""
    return ctx

async def zz_custom(ctx):
    return ctx
`);
    writeFile(repo, 'pkg/paths.py', `
def get_project_root():
    return "/tmp"
`);
    writeFile(repo, 'main.py', `
from pkg.sub import stealth_patch
from pkg import paths

async def run(ctx):
    await stealth_patch.apply(ctx, region="eu")
    await stealth_patch.zz_custom(ctx)
    root = paths.get_project_root()
    parts = [p.strip() for p in root.splitlines()]
    return parts
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // The fixture analyzed at all — otherwise every assertion below passes on an empty graph.
    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('binds `mod.apply(...)` to the function the module declares', () => {
    const impact = JSON.parse(
      runCli(['impact', 'pkg/sub/stealth_patch.py::apply', 'upstream', '--json'], { cwd: repo }).stdout
    );
    expect(JSON.stringify(impact).toLowerCase()).toContain('run');
    expect(impact.affectedCount).toBeGreaterThan(0);
  }, 180000);

  it('binds a module-qualified call across a package boundary', () => {
    const impact = JSON.parse(
      runCli(['impact', 'get_project_root', 'upstream', '--json'], { cwd: repo }).stdout
    );
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(impact).toLowerCase()).toContain('run');
  }, 180000);

  it('does not report a called function as dead code', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const dead = findings
      .filter((f: any) => f.type === 'ORPHAN' || f.type === 'UNUSED_EXPORT')
      .map((f: any) => f.symbol);
    expect(dead).not.toContain('apply');
    expect(dead).not.toContain('zz_custom');
    expect(dead).not.toContain('get_project_root');
  }, 180000);

  it('still sweeps a genuine Python built-in member call', () => {
    // The counter-test: `.strip()` on a local string IS a built-in and must not survive as an edge
    // to be resolved. A fix that keeps every dotted call would pass the three tests above and be
    // wrong — this is the case it must still eat.
    const graph = JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout);
    const names = JSON.stringify(graph).toLowerCase();
    expect(names).toContain('stealth_patch');            // the fixture really is in the graph
    const impact = JSON.parse(
      runCli(['impact', 'pkg/sub/stealth_patch.py::apply', 'downstream', '--json'], { cwd: repo }).stdout
    );
    const reached = JSON.stringify(impact.affectedNodes ?? []).toLowerCase();
    expect(reached).not.toContain('::strip');
  }, 180000);
});
