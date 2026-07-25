import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo13 — the Swift query used to fail tree-sitter compilation (TSQueryErrorNodeType at 146) because
 * tree-sitter-swift has no `struct_declaration`: struct / enum / extension / actor all fold into
 * `class_declaration` behind a `declaration_kind:` field. One bad pattern fails the WHOLE query, so
 * every .swift file silently collapsed to the Gnosis file-only fallback. These tests make the next
 * grammar bump fail LOUDLY instead of degrading.
 *
 * Why EVERYTHING runs in a CHILD PROCESS: native tree-sitter can only be driven from the FIRST jest
 * test file that loads it in a worker process. In any later file `tree.rootNode` comes back
 * `undefined`, `Query.matches` throws "Cannot read properties of undefined (reading 'tree')" and the
 * reflector falls back to Gnosis — for reasons that have nothing to do with Swift. Merely importing
 * the grammar registry in-process is enough to poison the NEXT native suite, so this file imports no
 * parsing code at all. Same harness as java-extraction.test.ts. Reproduce the underlying jest problem:
 *   npm test -- --runInBand tests/unit/core/type-only-imports.test.ts <any other native suite>
 */
describe('Swift extraction', () => {
  const FIXTURE = `import Foundation
import SwiftUI

protocol Greeter: Sendable {
    func greet(name: String) -> String
    var title: String { get }
}

public class UserService: NSObject, Greeter {
    let store: Store
    @Published var count: Int = 0

    init(store: Store) {
        self.store = store
    }

    func greet(name: String) -> String {
        return "hi"
    }

    public func refresh() async {
        let fresh = load()
        count = 1
    }
}

struct Point: Equatable {
    var x: Double
}

enum Direction: String {
    case north
    case south
}

extension Point {
    func flipped() -> Point { return self }
}

actor Counter {
    func bump() {}
}

open class Widget {}

package struct Crate {}

typealias Handler = (Int) -> Void

func topLevel(a: Int) -> Int {
    var t = 0
    t = a + 1
    return t
}
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/domain/analysis/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { SwiftProvider } = await import('./src/lib/core/parsing/languages/swift/index.ts');
  const { SWIFT_QUERIES } = await import('./src/lib/core/parsing/languages/swift/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('swift');
  const lang = grammars.getLanguage('swift');

  let compileError = null;
  try { grammars.createQuery(lang, SWIFT_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/UserService.swift', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new SwiftProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!lang,
    compileError,
    nodes: s.nodes.map((n) => ({
      name: n.name,
      kind: n.kind,
      canonicalKind: n.canonicalKind,
      id: n.metadata && n.metadata.id,
      parentId: n.metadata && n.metadata.parentId,
      dna: (n.metadata && n.metadata.dna) || {},
      isExport: !!n.isExport,
    })),
    rels: s.relationships.map((r) => ({
      type: r.type,
      source: r.sourceName,
      target: r.targetName,
      specifier: r.metadata && r.metadata.specifier,
    })),
  }));
})();
`;

  let result: {
    grammarLoaded: boolean;
    compileError: string | null;
    nodes: Array<{
      name: string; kind: string; canonicalKind: string; id: string; parentId: string;
      dna: Record<string, boolean>; isExport: boolean;
    }>;
    rels: Array<{ type: string; source: string; target: string; specifier?: string }>;
  };

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, FIXTURE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`Swift reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  const find = (name: string) => result.nodes.find((n) => n.name === name);
  const byId = (id: string) => result.nodes.find((n) => n.id === id);

  it('compiles the full Swift query against the installed grammar', () => {
    expect(result.grammarLoaded).toBe(true);
    expect(result.compileError).toBeNull();
  });

  it('does not degrade to the file-only Gnosis fallback', () => {
    const named = result.nodes.filter((n) => n.kind !== 'file' && n.kind !== 'unit');
    expect(named.length).toBeGreaterThanOrEqual(12);
  });

  it.each([
    // struct / enum / extension / actor all arrive as class_declaration + declaration_kind. The old
    // query asked for struct_declaration & friends — node types that do not exist in this grammar.
    ['UserService', 'class'],
    ['Point', 'struct'],
    ['Direction', 'enum'],
    ['Counter', 'class'],
    ['Widget', 'class'],
    ['Crate', 'struct'],
    ['Greeter', 'interface'],
    ['Handler', 'interface'],
    ['refresh', 'function'],
    ['flipped', 'function'],
    ['bump', 'function'],
    ['topLevel', 'function'],
    ['init', 'function'],
    ['store', 'property'],
    ['count', 'property'],
    ['x', 'property'],
    ['north', 'property'],
    ['title', 'property'],
    ['t', 'variable'],
  ])('extracts %s as a %s', (name, kind) => {
    expect(find(name as string)?.kind).toBe(kind);
  });

  it('keeps types STRUCTUREs and functions BEHAVIORs', () => {
    expect(find('UserService')?.canonicalKind).toBe('STRUCTURE');
    expect(find('Point')?.canonicalKind).toBe('STRUCTURE');
    expect(find('refresh')?.canonicalKind).toBe('BEHAVIOR');
  });

  it('flags an async func WITHOUT demoting it out of BEHAVIOR', () => {
    // `public func refresh() async` — @isAsync rides the same pattern as @isFunction. Before the
    // reflector gated its kind branch on DEFINITION_CAPTURES, the modifier capture rewrote kind to
    // 'async', which mapToCanonical falls through to ATOM — the function demoted and prune could
    // delete it. Both halves are asserted: kind survives AND the flag is actually recorded.
    const refresh = find('refresh');
    expect(refresh?.kind).toBe('function');
    expect(refresh?.canonicalKind).toBe('BEHAVIOR');
    expect(refresh?.dna.isAsync).toBe(true);

    // A plain func in the same file must NOT pick the flag up — the `?` quantifier binds nothing.
    expect(find('bump')?.dna.isAsync).toBeFalsy();
  });

  it('flags public / open / package visibility WITHOUT demoting the type', () => {
    for (const name of ['UserService', 'Widget']) {
      expect(find(name)?.kind).toBe('class');
      expect(find(name)?.canonicalKind).toBe('STRUCTURE');
      expect(find(name)?.dna.isExported).toBe(true);
      expect(find(name)?.isExport).toBe(true);
    }
    expect(find('Crate')?.kind).toBe('struct');
    expect(find('Crate')?.dna.isExported).toBe(true);

    // Swift's default visibility is `internal` — no modifier means not exported. Also proves the
    // optional group did not swallow the declarations that carry no `modifiers` node at all.
    expect(find('Point')?.dna.isExported).toBeFalsy();
    expect(find('Counter')?.dna.isExported).toBeFalsy();
  });

  it('never lets a MODIFIER capture become a node kind', () => {
    // Regression guard for the reflector bug, language-agnostic in spirit: modifier captures
    // (@isAsync/@isExported/@isStatic/@isAbstract) have dedicated handling and must never reach the
    // kind branch. query.matches() is NOT ordered by pattern index, so pattern order cannot fix it.
    const MODIFIER_KINDS = ['async', 'exported', 'static', 'abstract'];
    const offenders = result.nodes.filter((n) => MODIFIER_KINDS.includes(n.kind));
    expect(offenders).toEqual([]);

    // And every symbol that actually carries a modifier flag still holds a real canonical rank —
    // nothing silently fell through mapToCanonical into ATOM.
    const flagged = result.nodes.filter((n) => n.dna.isAsync || n.dna.isExported);
    expect(flagged.length).toBeGreaterThan(0);
    for (const n of flagged) {
      expect(['STRUCTURE', 'BEHAVIOR', 'ATOM', 'INFRA', 'UNIT']).toContain(n.canonicalKind);
      expect(n.kind).not.toBe('unknown');
    }
  });

  it('records the import module specifiers', () => {
    const imports = result.rels.filter((r) => r.type === 'IMPORTS').map((r) => r.specifier);
    expect(imports).toContain('Foundation');
    expect(imports).toContain('SwiftUI');
  });

  it('records protocol conformance and superclass heritage', () => {
    const heritage = result.rels.filter((r) => r.type === 'EXTENDS' || r.type === 'IMPLEMENTS');
    expect(heritage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'UserService', target: 'NSObject' }),
        expect.objectContaining({ source: 'UserService', target: 'Greeter' }),
        expect.objectContaining({ source: 'Point', target: 'Equatable' }),
      ])
    );
  });

  it('scopes members under their owning type', () => {
    // The protocol requirement and the class method share the name `greet` — two distinct nodes, and
    // a protocol requirement is a method while the class body func is a function.
    expect(byId('/repo/userservice.swift::userservice.greet')?.kind).toBe('function');
    expect(byId('/repo/userservice.swift::greeter.greet')?.kind).toBe('method');
    expect(byId('/repo/userservice.swift::point.flipped')?.parentId)
      .toBe('/repo/userservice.swift::point');
  });

  it('records a call made inside a method body', () => {
    const calls = result.rels.filter((r) => r.type === 'CALLS').map((r) => r.target);
    expect(calls).toContain('load');
  });

  it('records a re-assignment as an ACCESSES pulse', () => {
    // `t = a + 1` inside topLevel — the old query's (assignment (simple_identifier) ...) never
    // matched, because the LHS is wrapped in a (directly_assignable_expression).
    const pulses = result.rels.filter((r) => r.type === 'ACCESSES' && r.target === 't');
    expect(pulses.length).toBeGreaterThan(0);
  });
});
