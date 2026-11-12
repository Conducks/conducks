import { describe, it, expect, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBuild } from './helpers.js';

/**
 * The live pulse's HTTP relink (P-02-2) on its failure path (state-machine audit round 2, Q-02-2):
 * one worker failing rejected the pulse BEFORE the relink, so the files the other workers had already
 * re-stated (their HTTP edges dropped by `replaceFile`) were never re-linked.
 *
 * Runs the BUILT graph engine in a child process, like live-pulse-keeps-http-calls.test.ts.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-live-http2-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function run(body: string): any {
  const engine = path.resolve('build/src/lib/core/graph/graph-engine.js');
  const script = `
    const { ConducksGraph } = await import(${JSON.stringify(engine)});
    const fs = await import('node:fs');
    const graph = new ConducksGraph();
    graph.getGraph().addNode({ id: 'directory::${root.toLowerCase()}/billing', label: 'DIRECTORY',
      properties: { name: 'billing', canonicalKind: 'DIRECTORY', filePath: '${root.toLowerCase()}/billing' } });
    const httpTargets = () => graph.getGraph().getAllEdges().filter(e => String(e.id).includes('::http::')).map(e => e.targetId);
    ${body}
  `;
  const out = execFileSync('node', ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.lastIndexOf('OUT:') + 4));
}

describe('the live pulse re-links HTTP calls when a worker fails', () => {
  it('a failing worker does not stop the relink of the files the others re-stated', () => {
    ensureBuild();
    const file = path.join(root, 'web', 'client.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export async function pay() { return fetch('http://billing/api/pay'); }\n");
    // The second unit cannot be handed to a worker (a function does not survive structured clone):
    // its worker fails to start, which is the lever for "one worker failed".
    const out = run(`
      let rejected = false;
      try {
        await graph.pulseStructuralStream([
          { path: ${JSON.stringify(file)}, source: fs.readFileSync(${JSON.stringify(file)}, 'utf8') },
          { path: ${JSON.stringify(path.join(root, 'web', 'other.ts'))}, source: 'x', poison: () => 1 },
        ], [${JSON.stringify(file)}]);
      } catch { rejected = true; }
      await new Promise(r => setTimeout(r, 4000));
      process.stdout.write('OUT:' + JSON.stringify({ rejected, http: httpTargets() }));
    `);
    expect(out.rejected).toBe(true);
    expect(out.http).toEqual([`directory::${root.toLowerCase()}/billing`]);
  }, 120000);
});
