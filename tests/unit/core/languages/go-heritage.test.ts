import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo11 Phase 1 — Go heritage edges.
 *
 * WHAT "HERITAGE" MEANS IN GO (the semantics the next agent builds on):
 *   Go has no extends/implements keyword, so heritage here is EMBEDDING — the only structural
 *   "is-a" the source states outright:
 *     - struct embedding    `type Service struct { Base; *Logger }`  -> Service -> Base, Logger
 *     - interface embedding `type ReadWriter interface { Reader }`   -> ReadWriter -> Reader
 *   Deliberately NOT heritage:
 *     - a NAMED field (`name string`, `db *sql.DB`) — composition-by-reference, not is-a. The old
 *       query matched every field, so a struct would have "extended" string.
 *     - implicit interface satisfaction — nothing in the syntax states it; it needs type inference.
 *
 * The old pattern was also STANDALONE (no co-captured @name), so reflector.ts:438 dropped every
 * capture and the graph held zero Go heritage edges. Child-process harness: see
 * tests/unit/core/languages/java-extraction.test.ts.
 */
describe('Go heritage (embedding)', () => {
  const FIXTURE = `package main

import "io"

type Base struct { X int }

type Reader interface { Read() error }

type Service struct {
	Base
	*Logger
	name string
	m    map[string]int
}

type ReadWriter interface {
	Reader
	io.Closer
	Close() error
}

type Plain struct { name string }
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { GoProvider } = await import('./src/lib/core/parsing/languages/go/index.ts');
  const { GO_QUERIES } = await import('./src/lib/core/parsing/languages/go/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('go');
  const lang = grammars.getLanguage('go');

  let compileError = null;
  try { grammars.createQuery(lang, GO_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/service.go', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new GoProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!lang,
    compileError,
    nodes: s.nodes.map((n) => ({ name: n.name, kind: n.kind, canonicalKind: n.canonicalKind, label: n.label })),
    heritage: s.relationships
      .filter((r) => r.type === 'EXTENDS' || r.type === 'IMPLEMENTS')
      .map((r) => ({ type: r.type, source: r.sourceName, target: r.targetName })),
  }));
})();
`;

  let result: {
    grammarLoaded: boolean;
    compileError: string | null;
    nodes: Array<{ name: string; kind: string; canonicalKind: string; label: string }>;
    heritage: Array<{ type: string; source: string; target: string }>;
  };

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, FIXTURE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`Go reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('compiles the full Go query against the installed grammar', () => {
    expect(result.grammarLoaded).toBe(true);
    expect(result.compileError).toBeNull();
  });

  it('extracts real symbols, not just a file node', () => {
    const named = result.nodes.filter((n) => n.kind !== 'file' && n.kind !== 'unit');
    expect(named.length).toBeGreaterThanOrEqual(6);
  });

  it('records at least one heritage edge (the whole point of Phase 1)', () => {
    expect(result.heritage.length).toBeGreaterThan(0);
  });

  it('records an embedded struct as heritage, value and pointer alike', () => {
    const targets = result.heritage.filter((h) => h.source === 'Service').map((h) => h.target);
    expect(targets).toEqual(expect.arrayContaining(['Base', 'Logger']));
  });

  it('does NOT treat a named field as heritage', () => {
    // `name string` and `m map[string]int` are composition, not is-a. The leading `.` anchor in the
    // pattern pins the type to the FIRST named child, which only an embedded field satisfies.
    const targets = result.heritage.filter((h) => h.source === 'Service').map((h) => h.target);
    expect(targets).not.toContain('string');
    expect(targets).not.toContain('int');
    expect(result.heritage.filter((h) => h.source === 'Plain')).toEqual([]);
  });

  it('records an embedded interface as heritage, including a qualified one', () => {
    const targets = result.heritage.filter((h) => h.source === 'ReadWriter').map((h) => h.target);
    expect(targets).toEqual(expect.arrayContaining(['Reader', 'io.Closer']));
  });

  it('does not turn an interface METHOD into heritage', () => {
    // (method_elem) is a sibling of (type_elem) inside interface_type — only type_elem is an embed.
    const targets = result.heritage.filter((h) => h.source === 'ReadWriter').map((h) => h.target);
    expect(targets).not.toContain('Close');
    expect(result.heritage.filter((h) => h.source === 'Reader')).toEqual([]);
  });

  it('leaves a struct with no embedding extracted exactly as before', () => {
    expect(result.nodes.find((n) => n.name === 'Plain')).toEqual({
      name: 'Plain',
      kind: 'struct',
      canonicalKind: 'STRUCTURE',
      label: 'STRUCTURE',
    });
    expect(result.nodes.find((n) => n.name === 'Base')?.kind).toBe('struct');
    expect(result.nodes.find((n) => n.name === 'Reader')?.kind).toBe('interface');
  });
});
