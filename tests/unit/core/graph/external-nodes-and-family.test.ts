import { describe, it, expect } from '@jest/globals';
import {
  EXTERNAL_ROOT, ecosystemId, libraryNamespaceId, externalNodeProps, sameFamily,
} from '@/lib/core/graph/index.js';

/**
 * The graph door's id shapes and the cross-language guard, tested (ADR 0150 rules 10 and 12).
 *
 * Five exports across two leaves — `external-nodes.ts` and `import-resolver.ts` — reached from five
 * to seven places outside `core/graph` and named in no test. Both files exist BECAUSE the same idea
 * had been written four times and drifted; a rule that consolidates four copies and is then never
 * asserted can drift a fifth time with every gate green.
 *
 * The cases are the ones the code's own comments name as the failure it prevents, not generic ones:
 * an external node with no parent (32 packages and 19 namespaces were orphans before ADR 0057), and
 * an import binding across a language boundary.
 */
describe('every external node hangs off one root', () => {
  it('defaults parentId to the external root — the field three of four sites were missing', () => {
    // ADR 0057. Before it the graph was a forest presented as a tree: unreachable by any walk, and
    // absent from every answer to "what is under X".
    const props = externalNodeProps({ name: 'lodash', canonicalKind: 'ECOSYSTEM', canonicalRank: 2 });

    expect(props.parentId).toBe(EXTERNAL_ROOT);
    expect(props.isExternal).toBe(true);
  });

  it('lets a symbol inside a namespace hang off that namespace instead', () => {
    // The counter-test. A helper that ALWAYS set the root would flatten every induced library
    // symbol onto the ecosystem node and lose the namespace level entirely.
    const props = externalNodeProps({
      name: 'debounce', canonicalKind: 'BEHAVIOR', canonicalRank: 7,
      parentId: libraryNamespaceId('lodash'),
    });

    expect(props.parentId).toBe('lib::lodash');
  });

  it('carries an empty filePath, because an external node is in no file', () => {
    const props = externalNodeProps({ name: 'lodash', canonicalKind: 'ECOSYSTEM', canonicalRank: 2 });
    expect(props.filePath).toBe('');
  });
});

describe('external ids are lowercased, so one dependency is one node', () => {
  it('collapses spellings of a package name', () => {
    // CONDUCKS-4 applies to these ids too: two spellings would be two nodes for one dependency,
    // and every count that groups by package would be wrong by the number of spellings in use.
    expect(ecosystemId('Lodash')).toBe('ecosystem::lodash');
    expect(ecosystemId('lodash')).toBe('ecosystem::lodash');
    expect(libraryNamespaceId('Unresolved')).toBe('lib::unresolved');
  });

  it('keeps the two namespaces apart — a package is not a library namespace', () => {
    expect(ecosystemId('x')).not.toBe(libraryNamespaceId('x'));
  });
});

describe('sameFamily — an import must not bind across languages', () => {
  it('refuses a match between two KNOWN, differing families', () => {
    // The bug it exists for: a TypeScript `import` resolving onto a same-named Python or Go symbol.
    expect(sameFamily('/repo/a.ts', '/repo/b.py')).toBe(false);
    expect(sameFamily('/repo/a.ts', '/repo/b.go')).toBe(false);
    expect(sameFamily('/repo/a.rs', '/repo/b.java')).toBe(false);
  });

  it('allows a match inside one family, across its extensions', () => {
    expect(sameFamily('/repo/a.ts', '/repo/b.tsx')).toBe(true);
    expect(sameFamily('/repo/a.js', '/repo/b.mjs')).toBe(true);
    expect(sameFamily('/repo/a.h', '/repo/b.cpp')).toBe(true);
  });

  it('FAILS OPEN on an unknown extension rather than blocking', () => {
    // Stated in the code and asserted here because the direction is the whole design: a language
    // added to the parser before this table would otherwise have every import silently refused,
    // which reads as "nothing imports this" instead of "not classified".
    expect(sameFamily('/repo/a.ts', '/repo/b.zig')).toBe(true);
    expect(sameFamily('/repo/a.zig', '/repo/b.zig')).toBe(true);
  });

  it('reads the family from the FILE half of a node id', () => {
    // Callers pass node ids, not paths. Splitting on `::` is what makes that work, and dropping it
    // would make every id-shaped argument an unknown extension — fail-open, so silently permissive.
    expect(sameFamily('/repo/a.ts::thing', '/repo/b.py::thing')).toBe(false);
  });
});
