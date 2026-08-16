import { describe, it, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

// Edge data lives on `.properties`/`.confidence` — never `.metadata`/`.weight`. Both sides of the
// vault round-trip once read the wrong fields: saveEdges wrote `properties={}` on every edge, and
// load() assigned the parsed row back onto a nonexistent `.metadata`, so every vault-loaded edge had
// `properties === undefined`. A save-only test missed the second half, hence the full round-trip.
describe('Edge vault round-trip', () => {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-edge-rt-'));

  afterAll(() => {
    fs.rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('preserves edge properties and confidence through save -> load', async () => {
    const persistence = new SynapsePersistence(vaultRoot);

    const source = new ConducksAdjacencyList();
    source.addNode({ id: 'a.ts::unit', label: 'UNIT', properties: { name: 'a.ts', filePath: 'a.ts' } });
    source.addNode({ id: 'b.ts::unit', label: 'UNIT', properties: { name: 'b.ts', filePath: 'b.ts' } });
    source.addEdge({
      id: 'semantic::a.ts::unit->b.ts::unit::imports',
      sourceId: 'a.ts::unit',
      targetId: 'b.ts::unit',
      type: 'IMPORTS',
      confidence: 0.75,
      properties: { specifier: './b.js', origin: 'internal', line: 12 }
    });

    await persistence.saveNodes([...source.getAllNodes()], 'pulse_roundtrip');
    await persistence.saveEdges([...source.getAllEdges()], 'pulse_roundtrip');

    const loaded = new ConducksAdjacencyList();
    await persistence.load(loaded);

    const edges = [...loaded.getAllEdges()];
    expect(edges).toHaveLength(1);

    const edge = edges[0];
    expect(edge.properties).toEqual({ specifier: './b.js', origin: 'internal', line: 12 });
    expect(edge.confidence).toBe(0.75);
    // The field that used to swallow the data must stay empty.
    expect((edge as any).metadata).toBeUndefined();
  });
});
