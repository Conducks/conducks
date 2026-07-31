/**
 * ADR 0059 — every edge type is classified, and ARCH-3 only walks module-level coupling.
 *
 * `conducks audit` on this repository reported:
 *
 *   ARCH-3: Circular: path.dirname -> path.join -> path.resolve
 *
 * Those three functions are node's own standard library and none of them calls another. The edges
 * were `PULSES_TO` — value handovers produced by nested `path` calls in this project's source — and
 * ARCH-3 walked them because `IMPORT_CYCLE_IGNORED_EDGE_TYPES` was an array literal that nobody
 * updated when `PULSES_TO` joined the union.
 *
 * The classification is a `Record<EdgeType, …>` now, so the compiler catches the omission. That is
 * the real guard and it cannot be tested at runtime. What IS testable, and what this file pins, is
 * the consequence: a cycle made only of non-module edges is not an import cycle, and every edge type
 * has an opinion recorded about it.
 */
import { describe, it, expect } from '@jest/globals';
import {
  ConducksAdjacencyList,
  STRUCTURAL_EDGE_TYPES,
  NON_RUNTIME_EDGE_TYPES,
  IMPORT_CYCLE_IGNORED_EDGE_TYPES,
  type EdgeType,
} from '@/lib/core/graph/adjacency-list.js';

/**
 * Every member of the union, written out by hand ON PURPOSE. Deriving this list from the same
 * object under test would make the exhaustiveness assertion below vacuous — it would compare a
 * thing to itself and pass for any classification at all, which is the shape of unearned pass this
 * project keeps finding.
 */
const ALL_EDGE_TYPES: EdgeType[] = [
  'CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'ACCESSES', 'MEMBER_OF', 'DEPENDS_ON',
  'FROM_IMAGE', 'VIRTUAL_LINK', 'CONSTRUCTS', 'TYPE_REFERENCE', 'CONTAINS', 'HAS_METHOD',
  'HAS_PROPERTY', 'PULSES_TO', 'GOVERNS', 'DEFINES', 'ALIASES',
];

const node = (id: string) => ({ id, label: 'function', properties: { name: id, filePath: `${id}.ts` } });

const cycleOf = (type: EdgeType): ConducksAdjacencyList => {
  const graph = new ConducksAdjacencyList();
  ['a', 'b', 'c'].forEach(n => graph.addNode(node(n)));
  const ring: Array<[string, string]> = [['a', 'b'], ['b', 'c'], ['c', 'a']];
  ring.forEach(([sourceId, targetId]) =>
    graph.addEdge({ id: `${sourceId}->${targetId}`, sourceId, targetId, type, confidence: 1, properties: {} }));
  return graph;
};

describe('edge coupling classification', () => {
  it('classifies every edge type — the sets together account for the whole union', () => {
    // A type missing from all three sets is treated as module-level coupling, which is the
    // FAIL-LOUD direction (it gets walked by ARCH-3). This asserts the union has not grown a member
    // nobody thought about; the compiler enforces the same thing on EDGE_COUPLING itself.
    const classified = new Set(IMPORT_CYCLE_IGNORED_EDGE_TYPES);
    const moduleLevel = ALL_EDGE_TYPES.filter(t => !classified.has(t));

    expect(moduleLevel.sort()).toEqual(
      ['DEPENDS_ON', 'EXTENDS', 'FROM_IMAGE', 'IMPLEMENTS', 'IMPORTS', 'VIRTUAL_LINK'].sort()
    );
  });

  it('nests the three sets: containment is non-runtime is cycle-ignored', () => {
    STRUCTURAL_EDGE_TYPES.forEach(t => expect(NON_RUNTIME_EDGE_TYPES).toContain(t));
    NON_RUNTIME_EDGE_TYPES.forEach(t => expect(IMPORT_CYCLE_IGNORED_EDGE_TYPES).toContain(t));
  });

  it('keeps PULSES_TO, DEFINES and ALIASES out of import-cycle detection', () => {
    // The regression, named. PULSES_TO is the one that actually fired; DEFINES and ALIASES were
    // reaching the vault through `as any` at the same time and would have behaved identically.
    expect(IMPORT_CYCLE_IGNORED_EDGE_TYPES).toContain('PULSES_TO');
    expect(IMPORT_CYCLE_IGNORED_EDGE_TYPES).toContain('DEFINES');
    expect(IMPORT_CYCLE_IGNORED_EDGE_TYPES).toContain('ALIASES');
  });

  it('does not report a dataflow ring as an import cycle', () => {
    // The `path.dirname -> path.join -> path.resolve` finding, reduced. RED before the fix.
    const cycles = cycleOf('PULSES_TO')
      .detectCycles({ ignoreTypes: IMPORT_CYCLE_IGNORED_EDGE_TYPES, ignoreTypeOnly: true });

    expect(cycles).toEqual([]);
  });

  it('still reports a genuine import ring, so the fix did not just disable the check', () => {
    // Without this, every assertion above is satisfied by an ARCH-3 that never fires.
    const cycles = cycleOf('IMPORTS')
      .detectCycles({ ignoreTypes: IMPORT_CYCLE_IGNORED_EDGE_TYPES, ignoreTypeOnly: true });

    expect(cycles.length).toBeGreaterThan(0);
  });
});
