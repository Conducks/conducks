import { describe, it, expect, afterEach } from '@jest/globals';
import { ensureBuild } from './helpers.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The LIVE pulse is the watcher's whole mechanism, and it was dropping every file that imports.
 *
 * `analyze` reflects through the worker POOL, which passes the discovered file list as `allPaths`.
 * `pulseStructuralStream` is a SECOND path, used only by the watcher, and it spawned its worker with
 * `workerData: { units: chunk }` and nothing else. `pulse-worker` destructures `allPaths` from that,
 * so it arrived `undefined`, and the TypeScript resolver's `for (const f of allFiles)` threw
 * `allFiles is not iterable`. The worker reported the error, the result was skipped, and nothing at
 * all was ingested.
 *
 * MEASURED before the fix, editing a two-file project under `conducks watch`:
 *   Worker failure in .../src/main.ts: allFiles is not iterable   — a file WITH an import
 *   Change detected: src/a.ts                                     — a file with none
 *
 * The live path worked for exactly the files that import nothing, which in a real project is almost
 * none of them.
 *
 * Runs against BUILT javascript in a child process, deliberately: the worker resolves its own
 * imports as `.js`, so loading `pulse-worker.ts` under jest fails with ERR_MODULE_NOT_FOUND before
 * reaching any of this. A test of the built artifact is also the thing the watcher actually runs.
 */
const tmp: string[] = [];
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const mkProject = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-live-'));
  tmp.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'dep.ts'), 'export function dep(): number { return 1; }\n');
  fs.writeFileSync(path.join(root, 'src', 'main.ts'),
    "import { dep } from './dep.js';\nexport function run(): number { return dep(); }\n");
  return root;
};

/** Pulse one file through the BUILT graph engine and report the symbol names that landed. */
function livePulse(root: string, target: string, universe: string[]): string[] {
  // A BUILT path, not an import specifier — it is resolved on disk and handed to a child process.
  // A door rewrite once turned this line into `@/lib/core/graph/index.js`, which resolves to nothing
  // at runtime and failed both cases here (todo73).
  const engine = path.resolve('build/src/lib/core/graph/graph-engine.js');
  const script = `
    const { ConducksGraph } = await import(${JSON.stringify(engine)});
    const fs = await import('node:fs');
    const graph = new ConducksGraph();
    await graph.pulseStructuralStream(
      [{ path: ${JSON.stringify(target)}, source: fs.readFileSync(${JSON.stringify(target)}, 'utf8') }],
      ${JSON.stringify(universe)},
    );
    const names = Array.from(graph.getGraph().getAllNodes()).map(n => String(n.properties.name).toLowerCase());
    process.stdout.write('NAMES:' + JSON.stringify(names));
  `;
  const out = execFileSync('node', ['--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const marker = out.lastIndexOf('NAMES:');
  return marker === -1 ? [] : JSON.parse(out.slice(marker + 'NAMES:'.length));
}

describe('the live pulse resolves imports (the watcher path)', () => {
  it('ingests a file that imports another one', () => {
    ensureBuild();
    const root = mkProject();
    const main = path.join(root, 'src', 'main.ts');
    const dep = path.join(root, 'src', 'dep.ts');

    expect(livePulse(root, main, [main, dep])).toContain('run');
  }, 120_000);

  it('still ingests a file that imports nothing', () => {
    // The case that PASSED before the fix, kept so a change that trades one for the other fails.
    ensureBuild();
    const root = mkProject();
    const dep = path.join(root, 'src', 'dep.ts');

    expect(livePulse(root, dep, [dep])).toContain('dep');
  }, 120_000);
});
