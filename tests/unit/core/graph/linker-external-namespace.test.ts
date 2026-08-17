import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList, IntraLinker } from '@/lib/core/graph/index.js';
import { TypeScriptResolver } from '@/lib/core/parsing/index.js';

/**
 * Binding a bare name to an EXTERNAL package — the linker's block 3e, which had no test.
 *
 * An external import emits no `IMPORTS` edge at all (measured on a real subject: 0 of 3,095 carry an
 * external origin), so every import-scoped block above it is blind here. What the graph does hold is
 * the resolved half of the same import: the call processor consults the file's binding table and
 * writes `@scope/pkg::icon`, while the reference-as-value path writes the BARE name and dangles.
 *
 * So this block reads two facts off EDGES — which external namespaces a unit demonstrably touches,
 * and which `<namespace>::<symbol>` pairs exist anywhere — and binds only where both hold.
 *
 * It is a GUESSER, and the guard is `matches === 1`. Two packages exporting the same name is exactly
 * where a guess is wrong and nothing is left to break the tie, so it refuses (ADR 0070). That refusal
 * is the case worth having, because a wrong external edge is indistinguishable from a right one in
 * every answer downstream.
 *
 * Read off edges rather than nodes on purpose: virtual induction mints the external NODES after this
 * linker runs, so reading nodes would make the whole block work on the second pulse and not the
 * first — which is the shape of bug that looks like "it fixed itself".
 */
const tsResolver = new TypeScriptResolver();
const linker = () => new IntraLinker((s, f, a) => tsResolver.resolve(s, f, a));

const unit = (file: string) => ({
  id: `${file}::unit`, label: 'UNIT' as any,
  properties: { name: file.split('/').pop(), filePath: file, canonicalKind: 'UNIT' } as any,
});

const symbol = (file: string, name: string) => ({
  id: `${file}::${name}`, label: 'BEHAVIOR' as any,
  properties: { name, filePath: file, canonicalKind: 'BEHAVIOR', unitId: `${file}::unit` } as any,
});

/** An edge already resolved into an external package — what the binding table produced. */
const resolvedExternal = (from: string, ns: string, sym: string) => ({
  id: `${from}->${ns}::${sym}`, sourceId: from, targetId: `${ns}::${sym}`,
  type: 'CALLS' as any, confidence: 1, properties: {} as any,
});

/** The dangling half: the same import written as a bare name. */
const dangling = (from: string, bare: string) => ({
  id: `${from}->${bare}`, sourceId: from, targetId: bare,
  type: 'CALLS' as any, confidence: 0.4, properties: {} as any,
});

const targetOf = (g: ConducksAdjacencyList, edgeId: string) =>
  g.getAllEdges().find(e => e.id === edgeId)?.targetId;

describe('a bare name binds to an external package only when the graph attests it', () => {
  it('binds when the unit touches the namespace AND the symbol is attested under it', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addEdge(resolvedExternal('/p/a.ts::render', '@heroicons/react', 'academiccapicon'));
    const bare = dangling('/p/a.ts::render', 'academiccapicon');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('@heroicons/react::academiccapicon');
  });

  it('refuses when TWO namespaces attest the same name', () => {
    // The case the whole guard exists for. Nothing in the graph can break this tie, and a wrong
    // external edge reads exactly like a right one in `impact`, `trace` and `prune`.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addEdge(resolvedExternal('/p/a.ts::render', '@heroicons/react', 'icon'));
    g.addEdge(resolvedExternal('/p/a.ts::render', '@other/icons', 'icon'));
    const bare = dangling('/p/a.ts::render', 'icon');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('icon');
  });

  it('refuses when the unit never touches that namespace', () => {
    // Attested SOMEWHERE in the workspace is not enough — another file using a package says nothing
    // about this one. Both facts are required, and this is the half that is easy to drop.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addNode(unit('/p/other.ts'));
    g.addNode(symbol('/p/other.ts', 'draw'));
    g.addEdge(resolvedExternal('/p/other.ts::draw', '@heroicons/react', 'academiccapicon'));
    const bare = dangling('/p/a.ts::render', 'academiccapicon');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('academiccapicon');
  });

  it('refuses a name the namespace does not attest', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addEdge(resolvedExternal('/p/a.ts::render', '@heroicons/react', 'academiccapicon'));
    const bare = dangling('/p/a.ts::render', 'somethingelse');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('somethingelse');
  });
});

describe('what counts as an EXTERNAL namespace', () => {
  /**
   * Each case isolates ONE guard, and that took a second attempt.
   *
   * The predicate rejects a relative specifier AND anything carrying a source extension. The first
   * version of these cases used `./util.ts`, which BOTH guards reject — so deleting either one alone
   * changed nothing and the mutation survived while the test read as coverage. A case that two rules
   * can satisfy tests neither.
   */
  it('does not treat a relative specifier as a package', () => {
    // No file extension, so only the leading-dot rule can reject this.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addEdge({
      id: 'rel', sourceId: '/p/a.ts::render', targetId: './util::helper',
      type: 'CALLS' as any, confidence: 1, properties: {} as any,
    });
    const bare = dangling('/p/a.ts::render', 'helper');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('helper');
  });

  it('does not treat a bare FILE PATH as a package', () => {
    // No leading dot, so only the source-extension rule can reject this one.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addEdge({
      id: 'file', sourceId: '/p/a.ts::render', targetId: 'lib/util.ts::helper',
      type: 'CALLS' as any, confidence: 1, properties: {} as any,
    });
    const bare = dangling('/p/a.ts::render', 'helper');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('helper');
  });

  it('binds a bare package name, not only a scoped one', () => {
    // `lodash::debounce` is as external as `@scope/pkg::x`. A rule keyed on the leading `@` would
    // cover the scoped case and silently miss most of npm.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/p/a.ts'));
    g.addNode(symbol('/p/a.ts', 'render'));
    g.addEdge(resolvedExternal('/p/a.ts::render', 'lodash', 'debounce'));
    const bare = dangling('/p/a.ts::render', 'debounce');
    g.addEdge(bare);

    linker().resolve(g);

    expect(targetOf(g, bare.id)).toBe('lodash::debounce');
  });
});
