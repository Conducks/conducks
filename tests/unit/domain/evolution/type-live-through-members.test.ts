import { describe, it, expect } from '@jest/globals';
import { DeadCodeAnalyzer } from '@/lib/domain/evolution/dead-code.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * A type whose MEMBERS are used from outside it is in use (Java oracle, 2026-11-12).
 *
 * MEASURED before the fix, javac against prune on tools/benchmark/oracle-java/fixture: `Strings` and `Maths` were
 * ORPHAN — "defined but never referenced" — while `Strings.trimAll(...)` and `square(3)` called them.
 * A call to a static member lands on the MEMBER, so the type itself had no incoming edge, and javac
 * plainly disagrees: deleting the class breaks the build. The rule is not Java's: any class reached
 * only through its static members (a Python classmethod, a TypeScript static) has the same shape.
 */
describe('a type reached only through its members', () => {
  const unit = (file: string) => ({ id: `${file}::unit`, label: 'UNIT', properties: { name: file.split('/').pop(), filePath: file, canonicalKind: 'UNIT', kind: 'file' } });
  const type = (file: string, name: string) => ({
    id: `${file}::${name.toLowerCase()}`, label: 'STRUCTURE',
    properties: { name, filePath: file, canonicalKind: 'STRUCTURE', kind: 'class', isExport: true, unitId: `${file}::unit`, parentId: `${file}::unit` },
  });
  const method = (file: string, owner: string, name: string) => ({
    id: `${file}::${owner.toLowerCase()}.${name.toLowerCase()}`, label: 'BEHAVIOR',
    properties: { name, filePath: file, canonicalKind: 'BEHAVIOR', kind: 'method', unitId: `${file}::unit`, parentId: `${file}::${owner.toLowerCase()}` },
  });

  const build = () => {
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/r/Strings.java') as never);
    g.addNode(type('/r/Strings.java', 'Strings') as never);
    g.addNode(method('/r/Strings.java', 'Strings', 'trimAll') as never);
    g.addNode(unit('/r/Lonely.java') as never);
    g.addNode(type('/r/Lonely.java', 'Lonely') as never);
    g.addNode(method('/r/Lonely.java', 'Lonely', 'alone') as never);
    g.addNode(unit('/r/App.java') as never);
    g.addNode(type('/r/App.java', 'App') as never);
    g.addNode(method('/r/App.java', 'App', 'main') as never);
    g.addEdge({ id: 'imp', sourceId: '/r/App.java::unit', targetId: '/r/Strings.java::unit', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    g.addEdge({ id: 'imp2', sourceId: '/r/App.java::unit', targetId: '/r/Lonely.java::unit', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    g.addEdge({ id: 'c1', sourceId: '/r/App.java::app.main', targetId: '/r/Strings.java::strings.trimall', type: 'CALLS', confidence: 1, properties: {} } as never);
    return g;
  };
  const finding = (name: string) => new DeadCodeAnalyzer().analyze(build()).find(f => f.symbol === name);

  it('is not called ORPHAN — "never referenced" — when another file calls one of its members', () => {
    // Whether the EXPORT is consumed is a different question (UNUSED_EXPORT), answered by an import
    // that names the type; member use alone does not answer it (see dead-code.ts).
    expect(finding('Strings')?.type).not.toBe('ORPHAN');
  });

  it('a type nothing touches, member or not, is still reported', () => {
    expect(finding('Lonely')?.type).toBe('ORPHAN');
  });
});
