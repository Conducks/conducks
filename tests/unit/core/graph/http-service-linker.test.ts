import { describe, it, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { HttpServiceLinker } from '@/lib/core/graph/http-service-linker.js';

/**
 * A DOCUMENT THAT MENTIONS A URL IS NOT A CALLER.
 *
 * The linker scans raw file text for `http://<hostname>` and binds the hostname to a same-named
 * service node. On the frozen subject-c subject that minted `docs/memory.md::unit -CALLS->
 * src/plugins/providers/said-server` — the memory doc DESCRIBES the server, in prose, and the edge
 * claimed the documentation calls it. Found by the first `verify-edges` run on the subjects
 * (todo44#P5): both wrong CALLS edges on subject-c were markdown sources.
 *
 * Prose files are skipped by extension. Code stays scanned — the rule removes a false claim, not
 * the feature.
 */
describe('http service linker', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-http-link-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const build = () => {
    const g = new ConducksAdjacencyList();
    g.addNode({ id: '/repo/services/said-server', label: 'DIRECTORY', properties: { name: 'said-server', canonicalKind: 'DIRECTORY' } } as never);
    return g;
  };

  const write = (name: string, text: string): string => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, text);
    return p;
  };

  it('links a code file that calls the service', () => {
    const g = build();
    const code = write('client.ts', "await fetch('http://said-server:11434/api');\n");
    g.addNode({ id: `${code.toLowerCase()}::unit`, label: 'UNIT', properties: { name: 'client.ts', canonicalKind: 'UNIT' } } as never);
    const edges = new HttpServiceLinker(g).link([code]);
    expect(edges.length).toBe(1);
    expect(edges[0].targetId).toBe('/repo/services/said-server');
  });

  it('refuses a markdown file that merely mentions the URL', () => {
    const g = build();
    const doc = write('memory.md', 'said-server runs ollama at http://said-server:11434/api/tags — do not re-pull gemma.\n');
    g.addNode({ id: `${doc.toLowerCase()}::unit`, label: 'UNIT', properties: { name: 'memory.md', canonicalKind: 'UNIT' } } as never);
    expect(new HttpServiceLinker(g).link([doc])).toEqual([]);
  });
});
