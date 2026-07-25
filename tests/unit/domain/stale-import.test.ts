import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { DeadCodeAnalyzer } from '@/lib/domain/evolution/dead-code.js';

/**
 * todo11 Phase 2 — STALE_IMPORT.
 *
 * The finding was advertised by the MCP tool surface for a long time while its only gate
 * (`node.label === 'import_clause'`) compared raw tree-sitter node types against canonical labels
 * and could never fire. The first real attempt then produced 232 findings against
 * `tsc --noUnusedLocals`'s 96, because `implements X` registered no usage at all.
 *
 * These tests pin BOTH halves of the fix:
 *   1. the raw evidence the detector reads really is produced by a real reflect (an anti-regression
 *      guard against keying a feature off data nobody emits — todo11 Phase 3);
 *   2. the detector treats each evidence class as a use, so ONLY the genuinely unused binding is
 *      reported.
 *
 * Part 1 runs in a CHILD PROCESS via tsx: native tree-sitter can only be driven from the first jest
 * test file that loads it in a worker, so this file imports no parsing code at all. See
 * tests/unit/core/languages/java-extraction.test.ts for the full explanation.
 */

const FIXTURE = `
import { UsedClass, UnusedClass, AnnotationOnly, HeritageOnly } from './dep.js';
import * as namespaceOnly from './ns.js';
import './boot.js';

export class Impl implements HeritageOnly {
  public annotated: AnnotationOnly;

  public run(): void {
    const made = new UsedClass();
    void made;
  }
}
`;

const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/domain/analysis/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { TypeScriptProvider } = await import('./src/lib/core/parsing/languages/typescript/index.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('typescript');

  const file = { path: '/repo/consumer.ts', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new TypeScriptProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    rels: s.relationships.map((r) => ({
      type: r.type,
      target: r.targetName,
      specifier: r.metadata && r.metadata.specifier,
      bindingName: r.metadata && r.metadata.bindingName,
      isRawBinding: (r.metadata && r.metadata.isRawBinding) === true,
      isTypeOnly: (r.metadata && r.metadata.isTypeOnly) === true,
      original: r.metadata && r.metadata.original,
    })),
  }));
})();
`;

describe('STALE_IMPORT — the evidence a real reflect produces', () => {
  let rels: Array<{
    type: string; target: string; specifier?: string; bindingName?: string;
    isRawBinding: boolean; isTypeOnly: boolean; original?: string;
  }>;

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, FIXTURE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`TypeScript reflect child produced no result:\n${out}`);
    rels = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length)).rels;
  }, 180_000);

  it('emits one per-binding IMPORTS relationship per NAMED import', () => {
    const bindings = rels.filter((r) => r.type === 'IMPORTS' && r.isRawBinding).map((r) => r.bindingName);
    expect(new Set(bindings)).toEqual(new Set(['usedclass', 'unusedclass', 'annotationonly', 'heritageonly']));
  });

  it('emits NO per-binding relationship for a namespace or a side-effect import', () => {
    // Both are still recorded as file-level dependencies — they just carry no binding, which is
    // exactly why the detector can never call them stale.
    const specifiers = rels.filter((r) => r.type === 'IMPORTS').map((r) => r.specifier);
    expect(specifiers).toContain('./ns.js');
    expect(specifiers).toContain('./boot.js');
    const bound = rels.filter((r) => r.type === 'IMPORTS' && r.isRawBinding).map((r) => r.specifier);
    expect(bound).not.toContain('./ns.js');
    expect(bound).not.toContain('./boot.js');
  });

  it('records the heritage clause that makes an implements-only import used', () => {
    const implemented = rels.filter((r) => r.type === 'IMPLEMENTS').map((r) => r.target);
    expect(implemented).toContain('HeritageOnly');
  });

  it('records the type annotation that makes an annotation-only import used', () => {
    const typed = rels.filter((r) => r.type === 'TYPE_REFERENCE').map((r) => r.original ?? r.target);
    expect(typed).toContain('AnnotationOnly');
  });

  it('records the construction that makes a value import used', () => {
    const constructed = rels.filter((r) => r.type === 'CONSTRUCTS').map((r) => r.original ?? r.target);
    expect(constructed).toContain('UsedClass');
  });
});

describe('STALE_IMPORT — the detector', () => {
  const CONSUMER = '/repo/consumer.ts';
  const DEP = '/repo/dep.ts';

  /**
   * A graph in the shape the vault actually persists: a per-binding IMPORTS edge carries
   * `properties.bindingName` (lowercased) plus its specifier, and usage edges carry the
   * case-accurate spelling on `properties.original`. Heritage targets stay unresolved, as they do
   * in the real graph.
   */
  const buildGraph = (): ConducksAdjacencyList => {
    const graph = new ConducksAdjacencyList();

    const addNode = (id: string, name: string, filePath: string, kind: string, label: string) =>
      graph.addNode({
        id, label,
        properties: { name, filePath, kind, canonicalKind: label, canonicalRank: 7, isExport: true } as any,
      });

    addNode(`${CONSUMER}::unit`, 'consumer.ts', CONSUMER, 'file', 'UNIT');
    addNode(`${CONSUMER}::impl`, 'Impl', CONSUMER, 'struct', 'STRUCTURE');
    addNode(`${DEP}::unit`, 'dep.ts', DEP, 'file', 'UNIT');
    for (const name of ['UsedClass', 'UnusedClass', 'AnnotationOnly', 'HeritageOnly']) {
      addNode(`${DEP}::${name.toLowerCase()}`, name, DEP, 'struct', 'STRUCTURE');
    }

    const addEdge = (targetId: string, type: string, properties: any) =>
      graph.addEdge({
        id: `${CONSUMER}::unit->${targetId}::${type}::${JSON.stringify(properties)}`,
        sourceId: `${CONSUMER}::unit`, targetId, type: type as any, confidence: 1, properties,
      });

    // The four named bindings, plus the namespace and side-effect imports (no binding).
    addEdge(`${DEP}::unit`, 'IMPORTS', { specifier: './dep.js', isTypeOnly: false });
    addEdge(`${DEP}::usedclass`, 'IMPORTS', { specifier: './dep.js', bindingName: 'usedclass', isTypeOnly: false });
    addEdge(`${DEP}::unusedclass`, 'IMPORTS', { specifier: './dep.js', bindingName: 'unusedclass', isTypeOnly: false });
    addEdge(`${DEP}::annotationonly`, 'IMPORTS', { specifier: './dep.js', bindingName: 'annotationonly', isTypeOnly: true });
    addEdge(`${DEP}::heritageonly`, 'IMPORTS', { specifier: './dep.js', bindingName: 'heritageonly', isTypeOnly: true });
    addEdge('/repo/ns.ts::unit', 'IMPORTS', { specifier: './ns.js', isTypeOnly: false });
    addEdge('/repo/boot.ts::unit', 'IMPORTS', { specifier: './boot.js', isTypeOnly: false });

    // The usage evidence, one edge per class.
    addEdge(`${DEP}::usedclass`, 'CONSTRUCTS', { original: 'UsedClass', arguments: [] });
    addEdge(`${DEP}::annotationonly`, 'TYPE_REFERENCE', { original: 'AnnotationOnly', arguments: [] });
    addEdge('heritageonly', 'IMPLEMENTS', {});

    return graph;
  };

  const staleImports = () =>
    new DeadCodeAnalyzer().analyze(buildGraph()).filter((f) => f.type === 'STALE_IMPORT');

  it('flags exactly the binding with no evidence of use', () => {
    expect(staleImports().map((f) => f.symbol)).toEqual(['UnusedClass']);
  });

  it('reports the file and the specifier it came from', () => {
    const [finding] = staleImports();
    expect(finding.file).toBe(CONSUMER);
    expect(finding.message).toContain("'./dep.js'");
  });

  it.each([
    ['used as a value', 'UsedClass'],
    ['used only as a type annotation', 'AnnotationOnly'],
    ['used only in an implements clause', 'HeritageOnly'],
    ['a namespace import', 'namespaceOnly'],
    ['a side-effect import', 'boot.js'],
  ])('never flags an import %s', (_label, symbol) => {
    expect(staleImports().map((f) => f.symbol)).not.toContain(symbol);
  });
});
