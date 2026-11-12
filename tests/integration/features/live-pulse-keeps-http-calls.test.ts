import { describe, it, expect, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBuild } from './helpers.js';

/**
 * A watched save re-states the file's outgoing edges, and that includes its cross-service HTTP CALLS
 * edges — which only `analyze` created (`HttpServiceLinker`). So the first save of a file that calls
 * another service by URL dropped that edge, and `impact` on the service lost the caller until the next
 * full `analyze` (state-machine audit P-02-2). The live pulse now links the files it re-states.
 *
 * Runs the BUILT graph engine in a child process, like live-pulse-resolves-imports.test.ts: the worker
 * resolves its own imports as `.js`.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-live-http-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the live pulse keeps cross-service HTTP calls', () => {
  it('re-creates the CALLS edge to a service named in a URL', () => {
    ensureBuild();
    const file = path.join(root, 'web', 'client.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export async function pay() { return fetch('http://billing/api/pay'); }\n");
    const engine = path.resolve('build/src/lib/core/graph/graph-engine.js');
    const script = `
      const { ConducksGraph } = await import(${JSON.stringify(engine)});
      const fs = await import('node:fs');
      const graph = new ConducksGraph();
      graph.getGraph().addNode({ id: 'directory::${root.toLowerCase()}/billing', label: 'DIRECTORY',
        properties: { name: 'billing', canonicalKind: 'DIRECTORY', filePath: '${root.toLowerCase()}/billing' } });
      await graph.pulseStructuralStream([{ path: ${JSON.stringify(file)}, source: fs.readFileSync(${JSON.stringify(file)}, 'utf8') }], [${JSON.stringify(file)}]);
      const http = graph.getGraph().getAllEdges().filter(e => String(e.id).includes('::http::')).map(e => e.targetId);
      process.stdout.write('HTTP:' + JSON.stringify(http));
    `;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const http = JSON.parse(out.slice(out.lastIndexOf('HTTP:') + 5));
    expect(http).toEqual([`directory::${root.toLowerCase()}/billing`]);
  }, 120000);
});
