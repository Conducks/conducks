import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { GVREngine } from '@/lib/domain/evolution/gvr-engine.js';

/**
 * A class with methods can be renamed — containment edges are not references.
 *
 * FOUND by driving `conducks_rename` from the MCP surface: renaming the `Hands` class refused with
 * "120 reference(s) carry no source line". Every one of those was a MEMBER_OF edge from one of the
 * class's own methods — containment, where the parent id is CONSTRUCTED, never a place the name is
 * typed (`linker-intra.ts`: "the parent id is constructed, not referenced"). Those edges carry no
 * line by design, so the rename counted each method as an un-rewritable reference to its own class
 * and refused. A class with methods could never be renamed.
 */
describe('rename ignores containment edges (todo — MCP walk)', () => {
  const engine = () => new GVREngine();

  /** A class in one file, three methods pointing at it by MEMBER_OF, and one real caller elsewhere. */
  const graph = (): ConducksAdjacencyList => {
    const g = new ConducksAdjacencyList();
    const node = (id: string, name: string, kind: string, file: string, line: number) =>
      g.addNode({ id, label: kind, properties: { name, filePath: file, canonicalKind: kind, range: { start: { line } } } } as never);

    node('/r/svc.ts::widget', 'Widget', 'STRUCTURE', '/r/svc.ts', 10);
    node('/r/svc.ts::widget.run', 'run', 'BEHAVIOR', '/r/svc.ts', 12);
    node('/r/svc.ts::widget.stop', 'stop', 'BEHAVIOR', '/r/svc.ts', 20);
    node('/r/svc.ts::widget.reset', 'reset', 'BEHAVIOR', '/r/svc.ts', 28);
    node('/r/app.ts::main', 'main', 'BEHAVIOR', '/r/app.ts', 3);

    const edge = (id: string, s: string, t: string, type: string, line?: number) =>
      g.addEdge({ id, sourceId: s, targetId: t, type, confidence: 1, properties: line ? { line } : {} } as never);
    // Containment: each method belongs to the class. No line — the parent id is synthetic.
    edge('m1', '/r/svc.ts::widget.run', '/r/svc.ts::widget', 'MEMBER_OF');
    edge('m2', '/r/svc.ts::widget.stop', '/r/svc.ts::widget', 'MEMBER_OF');
    edge('m3', '/r/svc.ts::widget.reset', '/r/svc.ts::widget', 'MEMBER_OF');
    // A REAL reference: main constructs Widget, at a known line.
    edge('c1', '/r/app.ts::main', '/r/svc.ts::widget', 'CONSTRUCTS', 4);
    return g;
  };

  it('does not refuse a class rename over its own methods carrying no line', async () => {
    const result = await engine().renameSymbol(graph(), '/r/svc.ts::widget', 'Gadget', true);
    // The 120-phantom-reference refusal is gone: no unlocated entry is a MEMBER_OF containment edge.
    expect(result.unlocated ?? []).toEqual([]);
    expect(result.message).not.toMatch(/carry no source line/);
  });

  it('still plans the real reference sites — declaration and the constructing caller', async () => {
    const result = await engine().renameSymbol(graph(), '/r/svc.ts::widget', 'Gadget', true);
    expect(result.affectedFiles).toEqual(expect.arrayContaining(['/r/svc.ts', '/r/app.ts']));
  });

  it('a genuinely unrewritable reference — a real CALLS edge with no line — is STILL refused', async () => {
    const g = graph();
    // A call that the graph knows about but could not place: this must still block, so the fix
    // narrows the refusal to real references rather than removing it.
    g.addEdge({ id: 'x1', sourceId: '/r/app.ts::main', targetId: '/r/svc.ts::widget', type: 'CALLS', confidence: 1, properties: {} } as never);
    const result = await engine().renameSymbol(g, '/r/svc.ts::widget', 'Gadget', true);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/carry no source line/);
  });
});
