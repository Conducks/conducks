import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";

/**
 * ADR 0054 — the mirror's wave comes from SQL, and says when it truncates.
 *
 * `conducks mirror` served 0 nodes against a vault of 5,358. Three faults stacked: the gateway
 * delegated to an engine that walks the IN-MEMORY graph, `mirror` is in STALENESS_BYPASS so nothing
 * loaded it, and the branch meant to avoid the graph called `getCompactWave` through an `as any` —
 * a method that did not exist, so it threw and the catch returned an empty wave that looked like an
 * empty project.
 *
 * These drive the persistence layer directly, with no graph anywhere in the test, because "no graph
 * is required" is the property under test and a test that built one would not be checking it.
 */
describe('the visual wave is answered from the vault', () => {
  let root: string;
  let vault: SynapsePersistence;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-wave-'));
    vault = new SynapsePersistence(root, false);
    await vault.beginPulse();
    await vault.saveNodes([
      { id: 'repo', name: 'repo', label: 'REPOSITORY', properties: { name: 'repo', canonicalKind: 'REPOSITORY', canonicalRank: 1 } },
      { id: 'dir', name: 'src', label: 'DIRECTORY', properties: { name: 'src', canonicalKind: 'DIRECTORY', canonicalRank: 3, parentId: 'repo' } },
      { id: 'a.ts', name: 'a.ts', label: 'UNIT', properties: { name: 'a.ts', canonicalKind: 'UNIT', canonicalRank: 5, parentId: 'dir' } },
      { id: 'b.ts', name: 'b.ts', label: 'UNIT', properties: { name: 'b.ts', canonicalKind: 'UNIT', canonicalRank: 5, parentId: 'dir' } },
    ] as any, 'p1');
    await vault.saveEdges([
      { id: 'e1', sourceId: 'a.ts', targetId: 'b.ts', type: 'IMPORTS', confidence: 1, properties: {} },
      // An edge to a node OUTSIDE the slice: it must not become a line to nowhere on the canvas.
      { id: 'e2', sourceId: 'a.ts', targetId: 'ghost', type: 'CALLS', confidence: 1, properties: {} },
    ] as any, 'p1');
    await vault.save({ getMetadata: () => 'p1', getAllMetadata: () => new Map(), stats: { nodeCount: 4, edgeCount: 2 } } as any, { nodeCount: 4, edgeCount: 2 });
  });

  afterAll(async () => {
    await vault.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns nodes without any graph being loaded', async () => {
    const wave = await vault.getVisualWave();
    expect(wave.nodes.length).toBe(4);
  });

  it('draws only edges whose both endpoints are visible', async () => {
    const wave = await vault.getVisualWave();
    // `ghost` is not in the wave, so the edge pointing at it must not be drawn.
    expect(wave.links.some(l => l.target === 'ghost')).toBe(false);
    expect(wave.links.some(l => l.source === 'a.ts' && l.target === 'b.ts')).toBe(true);
  });

  it('clusters to the nearest container, per ADR 0028, not to the immediate parent', async () => {
    const wave = await vault.getVisualWave();
    const unit = wave.nodes.find(n => n.id === 'a.ts');
    // a.ts -> dir(DIRECTORY). Grouping by immediate parent gives the same answer here; grouping for
    // a deeper symbol would not, which is why the walk exists.
    expect(unit.clusterId).toBe('dir');
  });

  it('reports truncation rather than silently capping', async () => {
    const full = await vault.getVisualWave();
    expect(full.truncated).toBe(false);

    const capped = await vault.getVisualWave(undefined, 1200, 2);
    expect(capped.nodes.length).toBe(2);
    expect(capped.truncated).toBe(true);
    expect(capped.totalNodes).toBe(4);
  });
});
