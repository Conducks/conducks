import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { IntraLinker } from '@/lib/core/graph/linker-intra.js';

/**
 * Java calls bound through the RECEIVER's declared type (Java call oracle, 2026-11-12).
 *
 * MEASURED against javac before these rules: gson 78.9% of caller→callee pairs exact, 1,061 bound to
 * the wrong same-named method; spring-petclinic 93.3%, 12 wrong. After: 88.6% / 363 and 98.0% / 2.
 * Each test below is one rule, and fails without it.
 */
type N = { id: string; label: string; name: string; file: string; props?: Record<string, unknown> };
function build(nodes: N[], imports: Array<[string, string]>, call: { from: string; target: string; type?: string }) {
  const g = new ConducksAdjacencyList();
  const files = new Set(nodes.map(n => n.file));
  for (const f of files) g.addNode({ id: `${f}::unit`, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: f, canonicalKind: 'UNIT', canonicalRank: 0 } } as never);
  for (const n of nodes) g.addNode({ id: n.id, label: n.label, isShallow: false, properties: { unitId: `${n.file}::unit`, name: n.name, filePath: n.file, canonicalKind: n.label, canonicalRank: 6, ...(n.props ?? {}) } } as never);
  imports.forEach(([a, b], i) => g.addEdge({ id: `imp${i}`, sourceId: `${a}::unit`, targetId: `${b}::unit`, type: 'IMPORTS', confidence: 1, properties: {} } as never));
  g.addEdge({ id: 'e', sourceId: call.from, targetId: call.target, type: call.type ?? 'CALLS', confidence: 0.85, properties: { original: call.target } } as never);
  g.retargetEdges(new IntraLinker(() => undefined).resolve(g));
  return g.getAllEdges().find(e => e.id === 'e')!.targetId;
}

const APP = '/r/app.java', ADAPTER = '/r/stringadapter.java', CTRL = '/r/ownercontroller.java', REPO = '/r/ownerrepository.java';

describe('Java call binding', () => {
  it('a call never binds to a VARIABLE of the same name — `new StringAdapter().read()` beside a local `read`', () => {
    const target = build([
      { id: `${APP}::app.main`, label: 'BEHAVIOR', name: 'main', file: APP },
      { id: `${APP}::app.main.read`, label: 'ATOM', name: 'read', file: APP },
      { id: `${ADAPTER}::stringadapter`, label: 'STRUCTURE', name: 'StringAdapter', file: ADAPTER },
      { id: `${ADAPTER}::stringadapter.read`, label: 'BEHAVIOR', name: 'read', file: ADAPTER },
    ], [[APP, ADAPTER]], { from: `${APP}::app.main`, target: 'read' });
    expect(target).toBe(`${ADAPTER}::stringadapter.read`);
  });

  it('a FIELD receiver is found in the enclosing class scope — `owners.findAll()` inside a method', () => {
    const target = build([
      { id: `${CTRL}::ownercontroller`, label: 'STRUCTURE', name: 'OwnerController', file: CTRL },
      { id: `${CTRL}::ownercontroller.owners`, label: 'ATOM', name: 'owners', file: CTRL, props: { instanceOf: 'ownerrepository' } },
      { id: `${CTRL}::ownercontroller.find`, label: 'BEHAVIOR', name: 'find', file: CTRL },
      { id: `${REPO}::ownerrepository`, label: 'STRUCTURE', name: 'OwnerRepository', file: REPO },
      { id: `${REPO}::ownerrepository.findall`, label: 'BEHAVIOR', name: 'findAll', file: REPO },
      // A same-named method elsewhere: the name alone would be a guess between the two.
      { id: '/r/other.java::other', label: 'STRUCTURE', name: 'Other', file: '/r/other.java' },
      { id: '/r/other.java::other.findall', label: 'BEHAVIOR', name: 'findAll', file: '/r/other.java' },
    ], [[CTRL, '/r/other.java'], [CTRL, REPO]], { from: `${CTRL}::ownercontroller.find`, target: 'owners.findall' });
    expect(target).toBe(`${REPO}::ownerrepository.findall`);
  });

  it('a recorded type resolves to the TYPE even when a sibling file has a variable of that name', () => {
    const T = '/r/vettests.java', VET = '/r/vet.java', CTL = '/r/vetcontroller.java';
    const target = build([
      { id: `${T}::vettests.james`, label: 'BEHAVIOR', name: 'james', file: T },
      { id: `${T}::vettests.james.james`, label: 'ATOM', name: 'james', file: T, props: { instanceOf: 'vet' } },
      { id: `${VET}::vet`, label: 'STRUCTURE', name: 'Vet', file: VET },
      { id: `${VET}::vet.setname`, label: 'BEHAVIOR', name: 'setName', file: VET },
      { id: `${CTL}::vet`, label: 'ATOM', name: 'vet', file: CTL },
      // A same-named method in that sibling: a name guess picks it.
      { id: `${CTL}::vetcontroller`, label: 'STRUCTURE', name: 'VetController', file: CTL },
      { id: `${CTL}::vetcontroller.setname`, label: 'BEHAVIOR', name: 'setName', file: CTL },
    ], [[T, CTL], [T, VET]], { from: `${T}::vettests.james`, target: 'james.setname' });
    expect(target).toBe(`${VET}::vet.setname`);
  });

  it('a receiver named `constructor` is not Object.prototype.constructor (gson: analyze crashed)', () => {
    expect(() => build([
      { id: `${APP}::app.run`, label: 'BEHAVIOR', name: 'run', file: APP, props: { paramTypes: { other: 'thing' } } },
    ], [], { from: `${APP}::app.run`, target: 'constructor.construct' })).not.toThrow();
  });
});
