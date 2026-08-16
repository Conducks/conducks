import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo11 Phase 1 — TS / TSX / JS heritage edges.
 *
 * Before this suite the three JS-family queries captured @heritage in a STANDALONE pattern
 * ((class_heritage (extends_clause (_) @heritage))), which carries no @name. reflector.ts:438 only
 * runs heritage.process() when the SAME match also resolves a definition node, so every capture was
 * dropped in silence and the graph held ZERO EXTENDS/IMPLEMENTS edges for TypeScript. The fix
 * co-captures the subject in one pattern (the Java template). These tests pin that.
 *
 * They also pin two grammar shapes that are easy to get wrong and fail SILENTLY:
 *   - `abstract class` is (abstract_class_declaration), a different node type from
 *     (class_declaration) — miss it and every abstract base loses its heritage;
 *   - tree-sitter-javascript has NO (extends_clause) and NO (property_signature) /
 *     (public_field_definition). Those TS-only node types made the WHOLE JavaScript query fail to
 *     compile, which silently produced a file node and nothing else for every .js file.
 *
 * Why EVERYTHING runs in a CHILD PROCESS: see tests/unit/core/languages/java-extraction.test.ts —
 * native tree-sitter can only be driven from the first jest test file that loads it in a worker, so
 * this file imports no parsing code at all and spawns `tsx` instead.
 */
const FIXTURES: Record<string, { file: string; provider: [string, string]; source: string }> = {
  typescript: {
    file: '/repo/a.ts',
    provider: ['./src/lib/core/parsing/languages/typescript/index.ts', 'TypeScriptProvider'],
    source: `
class Base {}
interface INamed { name: string }
interface Loud extends INamed, Speaker { shout(): void }
export class Svc extends Base implements INamed, Speaker { run(): void {} }
export abstract class AbstractSvc extends Base implements INamed {}
abstract class BareAbstract { abstract go(): void }
export abstract class ExportedAbstract {}
class Gen extends Array<string> implements INamed {}
class Plain { go(): void {} }
`,
  },
  tsx: {
    file: '/repo/a.tsx',
    provider: ['./src/lib/core/parsing/languages/tsx/index.ts', 'TSXProvider'],
    source: `
class Base {}
interface INamed { name: string }
interface Loud extends INamed, Speaker {}
export class Svc extends Base implements INamed, Speaker { render() { return <div className="x"/>; } }
export abstract class AbsPanel { abstract render(): void }
class Plain {}
`,
  },
  javascript: {
    file: '/repo/a.js',
    provider: ['./src/lib/core/parsing/languages/javascript/index.ts', 'JavaScriptProvider'],
    source: `
class Base {}
class Svc extends Base { run() {} }
export class Exp extends Base {}
class Plain {}
`,
  },
};

const CHILD = `
(async () => {
  const [lang, provPath, provName, filePath, source] = JSON.parse(process.argv[1]);
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  const QUERY_SOURCE = {
    typescript: ['./src/lib/core/parsing/languages/typescript/queries.ts', 'TYPESCRIPT_QUERIES'],
    tsx: ['./src/lib/core/parsing/languages/tsx/queries.ts', 'TSX_QUERIES'],
    javascript: ['./src/lib/core/parsing/languages/javascript/queries.ts', 'JAVASCRIPT_QUERIES'],
  }[lang];
  const queries = (await import(QUERY_SOURCE[0]))[QUERY_SOURCE[1]];

  await grammars.loadLanguage(lang);
  const grammar = grammars.getLanguage(lang);

  let compileError = null;
  try { grammars.createQuery(grammar, queries); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const Provider = (await import(provPath))[provName];
  const file = { path: filePath, source };
  const s = await new ConducksReflector().reflect(file, new Provider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!grammar,
    compileError,
    nodes: s.nodes.map((n) => ({ name: n.name, kind: n.kind, canonicalKind: n.canonicalKind, label: n.label, isExport: !!n.isExport })),
    heritage: s.relationships
      .filter((r) => r.type === 'EXTENDS' || r.type === 'IMPLEMENTS')
      .map((r) => ({ type: r.type, source: r.sourceName, target: r.targetName })),
  }));
})();
`;

type Result = {
  grammarLoaded: boolean;
  compileError: string | null;
  nodes: Array<{ name: string; kind: string; canonicalKind: string; label: string; isExport: boolean }>;
  heritage: Array<{ type: string; source: string; target: string }>;
};

const results: Record<string, Result> = {};

beforeAll(() => {
  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  for (const [lang, f] of Object.entries(FIXTURES)) {
    const argv = JSON.stringify([lang, f.provider[0], f.provider[1], f.file, f.source]);
    const out = execFileSync(tsx, ['-e', CHILD, argv], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`${lang} reflect child produced no result:\n${out}`);
    results[lang] = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }
}, 300_000);

describe.each(['typescript', 'tsx', 'javascript'])('%s heritage', (lang) => {
  it('compiles the full query against the installed grammar', () => {
    expect(results[lang].grammarLoaded).toBe(true);
    expect(results[lang].compileError).toBeNull();
  });

  it('extracts real symbols, not just a file node', () => {
    // The fallback emits a single uppercase-kind FILE node and nothing else.
    const named = results[lang].nodes.filter((n) => n.kind !== 'file' && n.kind !== 'unit');
    expect(named.length).toBeGreaterThanOrEqual(4);
    expect(results[lang].nodes.map((n) => n.kind)).not.toContain('FILE');
  });

  it('records at least one heritage edge (the whole point of Phase 1)', () => {
    expect(results[lang].heritage.length).toBeGreaterThan(0);
  });

  it('records `class Svc extends Base` as a heritage edge', () => {
    expect(results[lang].heritage).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'Svc', target: 'Base' })])
    );
  });

  it('leaves a class with NO heritage extracted exactly as before', () => {
    const plain = results[lang].nodes.find((n) => n.name === 'Plain');
    expect(plain).toEqual({ name: 'Plain', kind: 'struct', canonicalKind: 'STRUCTURE', label: 'STRUCTURE', isExport: false });
    expect(results[lang].heritage.filter((h) => h.source === 'Plain')).toEqual([]);
  });
});

describe('TypeScript-only heritage shapes', () => {
  it('records every implemented interface, not just the first', () => {
    // (implements_clause) holds N sibling types; each yields its own match.
    const targets = results.typescript.heritage.filter((h) => h.source === 'Svc').map((h) => h.target);
    expect(targets).toEqual(expect.arrayContaining(['Base', 'INamed', 'Speaker']));
  });

  it('records an interface extending other interfaces via extends_type_clause', () => {
    // An interface has NO (class_heritage); its supertypes live in a sibling (extends_type_clause).
    const targets = results.typescript.heritage.filter((h) => h.source === 'Loud').map((h) => h.target);
    expect(targets).toEqual(expect.arrayContaining(['INamed', 'Speaker']));
  });

  it('records heritage for an ABSTRACT class (abstract_class_declaration)', () => {
    const targets = results.typescript.heritage.filter((h) => h.source === 'AbstractSvc').map((h) => h.target);
    expect(targets).toEqual(expect.arrayContaining(['Base', 'INamed']));
  });

  it('captures the base type of a generic extends without its type arguments', () => {
    // (extends_clause) carries both value: and type_arguments:; only value: is the supertype, so
    // `extends Array<string>` must yield Array and NOT string.
    const targets = results.typescript.heritage.filter((h) => h.source === 'Gen').map((h) => h.target);
    expect(targets).toContain('Array');
    expect(targets).not.toContain('string');
  });

  it('types the relation from the CLAUSE, not the target name', () => {
    // The clause keyword IS the relation. typescript/queries.ts captures @heritage_extends /
    // @heritage_implements and reflector.ts forwards that to HeritageProcessor, whose target-NAME
    // heuristic (/^I[A-Z]/, /Interface$/, /Trait$/) is now a fallback for plain @heritage only.
    // Before the fix `implements Speaker` was typed EXTENDS and `extends IBase` IMPLEMENTS.
    expect(results.typescript.heritage).toEqual(
      expect.arrayContaining([
        { type: 'IMPLEMENTS', source: 'Svc', target: 'INamed' },
        { type: 'IMPLEMENTS', source: 'Svc', target: 'Speaker' },
        { type: 'EXTENDS', source: 'Svc', target: 'Base' },
      ])
    );
    // No implements clause anywhere may be typed EXTENDS, and no extends clause IMPLEMENTS.
    const svc = results.typescript.heritage.filter((h) => h.source === 'Svc');
    expect(svc.find((h) => h.target === 'Base')!.type).toBe('EXTENDS');
    // `class Gen extends Array<string> implements INamed` — an I-prefixed name reached only through
    // the implements clause, and a non-I name reached only through extends.
    const gen = results.typescript.heritage.filter((h) => h.source === 'Gen');
    expect(gen).toEqual(
      expect.arrayContaining([
        { type: 'EXTENDS', source: 'Gen', target: 'Array' },
        { type: 'IMPLEMENTS', source: 'Gen', target: 'INamed' },
      ])
    );
    // An interface's supertypes are EXTENDS, whatever they are called.
    expect(results.typescript.heritage.filter((h) => h.source === 'Loud').every((h) => h.type === 'EXTENDS')).toBe(true);
  });

  it('extracts an abstract class that has NO heritage', () => {
    // (abstract_class_declaration) is a distinct node type from (class_declaration). Until the plain
    // pattern was added, an abstract class only got a node when a heritage pattern matched it — a
    // heritage-less abstract base (e.g. ConducksPrism, prism-core.ts:11) produced nothing at all.
    const bare = results.typescript.nodes.filter((n) => n.name === 'BareAbstract');
    expect(bare).toEqual([
      { name: 'BareAbstract', kind: 'struct', canonicalKind: 'STRUCTURE', label: 'STRUCTURE', isExport: false },
    ]);
  });

  it('extracts an EXPORTED abstract class with no heritage, marked as an export', () => {
    const exported = results.typescript.nodes.filter((n) => n.name === 'ExportedAbstract');
    expect(exported.length).toBe(1);
    expect(exported[0]).toMatchObject({ kind: 'struct', canonicalKind: 'STRUCTURE', isExport: true });
  });

  it('yields exactly ONE node per abstract class despite 3 patterns matching it', () => {
    // `export abstract class AbstractSvc extends Base implements INamed` is matched by the plain
    // abstract pattern, the export-wrapped one, and both abstract heritage patterns. They must all
    // fold into one cached node, not duplicate it.
    expect(results.typescript.nodes.filter((n) => n.name === 'AbstractSvc').length).toBe(1);
    expect(results.typescript.nodes.find((n) => n.name === 'AbstractSvc')).toMatchObject({
      kind: 'struct', canonicalKind: 'STRUCTURE', isExport: true,
    });
  });
});

describe('TSX heritage', () => {
  it('works on a JSX-flavoured class body', () => {
    // Same grammar family, but a separate compiled language — a JSX-bearing class body must not
    // stop the heritage pattern from matching.
    const targets = results.tsx.heritage.filter((h) => h.source === 'Svc').map((h) => h.target);
    expect(targets).toEqual(expect.arrayContaining(['Base', 'INamed', 'Speaker']));
    expect(results.tsx.nodes.find((n) => n.name === 'render')?.kind).toBe('method');
  });

  it('extracts an exported abstract class exactly once', () => {
    const abs = results.tsx.nodes.filter((n) => n.name === 'AbsPanel');
    expect(abs.length).toBe(1);
    expect(abs[0]).toMatchObject({ kind: 'struct', canonicalKind: 'STRUCTURE', isExport: true });
  });

  it('types implements as IMPLEMENTS and extends as EXTENDS', () => {
    expect(results.tsx.heritage).toEqual(
      expect.arrayContaining([
        { type: 'EXTENDS', source: 'Svc', target: 'Base' },
        { type: 'IMPLEMENTS', source: 'Svc', target: 'INamed' },
        { type: 'IMPLEMENTS', source: 'Svc', target: 'Speaker' },
      ])
    );
  });
});

describe('JavaScript heritage', () => {
  it('records extends through an export_statement wrapper', () => {
    expect(results.javascript.heritage).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'Exp', target: 'Base' })])
    );
  });

  it('has no implements — JavaScript has no such clause', () => {
    expect(results.javascript.heritage.every((h) => h.type === 'EXTENDS')).toBe(true);
  });
});
