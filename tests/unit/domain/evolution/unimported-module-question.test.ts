import { describe, it, expect } from '@jest/globals';
import { DeadCodeAnalyzer } from '@/lib/domain/evolution/dead-code.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * ADR 0104 — `prune` separates a verdict from a question.
 *
 * `memory.md`: "an unreferenced module is a question, not a finding" — because *disconnected by
 * accident* and *deliberately not wired yet* are the same zero-incoming-edges shape, and deleting
 * the second destroys a capability nobody decided to drop.
 *
 * The first attempt at this made EVERY symbol in an unimported file a question, and that swallowed
 * genuine dead code: the oracle's `unused.ts` — one exported leaf, imported by nothing, calling
 * nothing — stopped being reported at all. Two fixture expectations that both had to hold pinned the
 * real line:
 *
 *   T16  `unused.ts::neverImported`   → a FINDING. Nothing imports the file AND nothing inside it
 *                                       references anything. An inert file cannot be a capability
 *                                       awaiting wiring, because nothing inside it is wired either.
 *   T28  `orphan-module.ts`           → a QUESTION. Nothing imports it, but `orphanSecond` calls
 *                                       `orphanHelper` — it is a module that does something.
 */
describe('an unimported module is a question; an inert file is dead', () => {
  const unit = (file: string) => ({
    id: `${file}::unit`,
    label: 'UNIT',
    properties: { name: file.split('/').pop(), filePath: file, canonicalKind: 'UNIT', kind: 'file' },
  });
  const fn = (file: string, name: string) => ({
    id: `${file}::${name.toLowerCase()}`,
    label: 'BEHAVIOR',
    properties: {
      name, filePath: file, canonicalKind: 'BEHAVIOR', kind: 'function',
      isExport: true, unitId: `${file}::unit`,
    },
  });

  const build = () => {
    const g = new ConducksAdjacencyList();
    // INERT and unimported: one exported leaf that references nothing.
    g.addNode(unit('/repo/src/inert.ts') as never);
    g.addNode(fn('/repo/src/inert.ts', 'neverImported') as never);

    // WIRED and unimported: two symbols, one calling the other.
    g.addNode(unit('/repo/src/capability.ts') as never);
    g.addNode(fn('/repo/src/capability.ts', 'helper') as never);
    g.addNode(fn('/repo/src/capability.ts', 'second') as never);
    g.addEdge({
      id: 'e1',
      sourceId: '/repo/src/capability.ts::second',
      targetId: '/repo/src/capability.ts::helper',
      type: 'CALLS', confidence: 1.0, properties: {},
    } as never);
    return g;
  };

  const findingFor = (name: string) =>
    new DeadCodeAnalyzer().analyze(build()).find(f => f.symbol === name);

  it('an inert, unimported file yields a verdict — it is genuinely dead', () => {
    expect(findingFor('neverImported')?.type).toBe('ORPHAN');
  });

  it('a wired, unimported file yields a question — the graph cannot tell', () => {
    expect(findingFor('second')?.type).toBe('UNIMPORTED_MODULE');
    expect(findingFor('helper')?.type).toBe('UNIMPORTED_MODULE');
  });

  /**
   * The question must still say what to DO. "Unknown" with no next step is the same dead end as a
   * wrong verdict — the reader is left with a red line and no way to resolve it.
   */
  it('the question names the decision the reader has to make', () => {
    expect(findingFor('second')?.message).toMatch(/disconnected, or never connected/i);
  });
});
