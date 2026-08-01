import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * A declaration must never be parented by something it CONTAINS.
 *
 * `export class Widget { run(): void {} }` on ONE line gave the class and its method identical start
 * and end rows. `getScopeAt` resolved a declaration's scope from rows alone and excluded only the
 * declaration's own NAME, so while resolving `Widget` its own method `run` still passed the row test
 * and became the parent — id `helpers.ts::run.widget` instead of `helpers.ts::widget`.
 *
 * The visible damage was not the parent pointer, it was IDENTITY: the scope chain is what the node id
 * is built from. The import edge pointed at `::widget`, no node had that id, so `prune` could not
 * resolve the binding and silently never reported the unused import. Multi-line code hid it entirely —
 * there the class's start row falls outside the method's range and is filtered naturally.
 *
 * Runs in a CHILD PROCESS for the same reason as the other grammar suites: native tree-sitter can only
 * be driven from the first jest test file that loads it in a worker.
 */
const SOURCE = `
export function plain(x: number): number { return x + 1; }
export class OneLine { run(): void {} }
export class MultiLine {
  go(): void {}
}
class Outer { inner(): void {} }
`;

const CHILD = `
(async () => {
  const [filePath, source] = JSON.parse(process.argv[1]);
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  const { TypeScriptProvider } = await import('./src/lib/core/parsing/languages/typescript/index.ts');

  await grammars.loadLanguage('typescript');
  const file = { path: filePath, source };
  const s = await new ConducksReflector().reflect(file, new TypeScriptProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    nodes: s.nodes.map((n) => ({
      name: n.name,
      kind: n.kind,
      id: (n.metadata && n.metadata.id) ?? null,
      parentId: (n.metadata && n.metadata.parentId) ?? null,
    })),
  }));
})();
`;

type Node = { name: string; kind: string; id: string | null; parentId: string | null };
let nodes: Node[] = [];

beforeAll(() => {
  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const out = execFileSync(tsx, ['-e', CHILD, JSON.stringify(['/repo/a.ts', SOURCE])], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const line = out.split('\n').find(l => l.includes('__RESULT__'));
  if (!line) throw new Error(`reflect child produced no result:\n${out}`);
  nodes = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length)).nodes;
});

const byName = (name: string): Node | undefined => nodes.find(n => n.name === name);

describe('scope chain — a declaration is never parented by what it contains', () => {
  it('parses the fixture at all', () => {
    expect(nodes.length).toBeGreaterThan(0);
    expect(byName('OneLine')).toBeDefined();
    expect(byName('MultiLine')).toBeDefined();
  });

  it('a ONE-LINE class is not nested under its own method', () => {
    const cls = byName('OneLine')!;
    // The regression: id came out `...::run.oneline`.
    expect(cls.id ?? '').not.toMatch(/run\.oneline/);
    expect((cls.id ?? '').endsWith('::oneline')).toBe(true);
  });

  it('the one-line class METHOD is still nested under its class', () => {
    // The fix must not overshoot: containment in the correct direction has to survive.
    expect(byName('run')?.id ?? '').toMatch(/oneline\.run$/);
  });

  it('a multi-line class is unaffected — it always worked', () => {
    expect((byName('MultiLine')?.id ?? '').endsWith('::multiline')).toBe(true);
    expect(byName('go')?.id ?? '').toMatch(/multiline\.go$/);
  });

  it('holds for a non-exported one-line class too', () => {
    expect((byName('Outer')?.id ?? '').endsWith('::outer')).toBe(true);
    expect(byName('inner')?.id ?? '').toMatch(/outer\.inner$/);
  });

  it('a top-level function keeps a bare id', () => {
    expect((byName('plain')?.id ?? '').endsWith('::plain')).toBe(true);
  });
});
