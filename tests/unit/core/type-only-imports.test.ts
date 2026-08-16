import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/index.js";
import { grammars } from "@/lib/core/parsing/index.js";

/**
 * ADR 0016 — a plain `import { X } from` whose bindings are only used in type position is erased by
 * the compiler and is not runtime coupling. These parse real TypeScript, because the classification
 * depends on what the tree-sitter query actually captures.
 */
describe('Type-only import classification', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  const reflect = async (source: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.ts', source };
    return reflector.reflect(file, provider as any, context, [file.path, '/repo/b.ts']);
  };

  const bindings = (spectrum: any) =>
    spectrum.relationships.filter((r: any) => r.type === 'IMPORTS' && r.metadata?.isRawBinding);

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  it('marks a binding used only in a type annotation as type-only', async () => {
    const spectrum = await reflect(`
      import { Shape } from './b.js';
      export function area(s: Shape): number { return 1; }
    `);
    const shape = bindings(spectrum).find((r: any) => r.metadata.bindingNameRaw === 'Shape');
    expect(shape?.metadata.isTypeOnly).toBe(true);
  });

  it('does NOT mark a binding that is constructed or called', async () => {
    const spectrum = await reflect(`
      import { Widget } from './b.js';
      export function make() { return new Widget(); }
    `);
    const widget = bindings(spectrum).find((r: any) => r.metadata.bindingNameRaw === 'Widget');
    expect(widget?.metadata.isTypeOnly).toBeUndefined();
  });

  it('does not let a local variable claim a same-named type as a value use', async () => {
    // Node IDs are lowercased for APFS, so the parameter `nodeId` and the imported type `NodeId`
    // both key to `nodeid`. Before the fix the variable's value uses marked the TYPE as value-used,
    // which kept conducks' own ARCH-3 cycle alive. `nodeId`/`NodeId` is a routine TS convention.
    const spectrum = await reflect(`
      import { NodeId } from './b.js';
      export function pick(nodeId: NodeId): string { return String(nodeId); }
    `);
    const nodeId = bindings(spectrum).find((r: any) => r.metadata.bindingNameRaw === 'NodeId');
    expect(nodeId?.metadata.isTypeOnly).toBe(true);
  });

  it('leaves an unused import as a value import — no evidence is not type evidence', async () => {
    // ADR 0016 defaults to value on uncertainty: over-counting coupling is visible, hiding a real
    // cycle is not. An import with no usage at all therefore stays unmarked.
    const spectrum = await reflect(`
      import { Unused } from './b.js';
      export const x = 1;
    `);
    const unused = bindings(spectrum).find((r: any) => r.metadata.bindingNameRaw === 'Unused');
    expect(unused?.metadata.isTypeOnly).toBeUndefined();
  });
});
