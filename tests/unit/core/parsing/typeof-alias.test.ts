import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * todo42#P2 — `type Registry = typeof registry` states, in the source, that the TYPE is the shape
 * of the VARIABLE. The reflector records which variable, so the linker can follow a parameter typed
 * `Registry` through to the variable's object paths instead of stopping at a type node that owns
 * nothing. A plain alias records no target — the capture is optional on the one existing pattern,
 * because a second pattern matching the same node would race it to create the node (ADR 0086).
 */
describe('typeof alias capture', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  const reflect = async (source: string) => {
    const context = new AnalyzeContext();
    return reflector.reflect({ path: '/repo/a.ts', source }, provider as never, context, ['/repo/a.ts']);
  };

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  /**
   * DISTINCT names on purpose. `type Registry = typeof registry` — the common spelling — lowercases
   * both to ONE id (CONDUCKS-4), the value wins the node, and the merged node already carries the
   * object paths, so no hop is needed there at all. The typeof chain earns its keep exactly when
   * the names differ and the type node would otherwise be a leaf owning nothing.
   */
  it('records the variable a typeof alias points at', async () => {
    const spectrum = await reflect(`
const serviceHub = { audit: { status: statusFn } };
export type Registry = typeof serviceHub;
`);
    const alias = spectrum.nodes.find((n: any) => n.name === 'Registry');
    expect(alias?.metadata.typeofTarget).toBe('servicehub');
  });

  /**
   * OVERLOADS: the doc sits above the FIRST signature, the node is minted at the IMPLEMENTATION.
   * Measured on orchestrator's registry.ts — `register` had its doc at :39-42, overloads at :43-44,
   * implementation at :45, and the two-line window could not bridge them while `has` beside it
   * carried its own doc fine. The join now anchors at the first signature of a contiguous run.
   */
  it('bridges a doc across overload signatures to the implementation', async () => {
    const spectrum = await reflect(`
class Hub {
  /** Register a service into the hub. */
  register(a: string): void;
  register(a: number): void;
  register(a: unknown): void {
    return;
  }
}
`);
    const method = spectrum.nodes.find((n: any) => n.name === 'register');
    expect(method?.metadata.doc).toBe('Register a service into the hub.');
  });

  it('records nothing for a plain type alias', async () => {
    const spectrum = await reflect(`
export type Verdict = 'HIGH' | 'LOW';
`);
    const alias = spectrum.nodes.find((n: any) => n.name === 'Verdict');
    expect(alias).toBeDefined();
    expect(alias?.metadata.typeofTarget).toBeUndefined();
  });
});
