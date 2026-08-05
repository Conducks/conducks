import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { JavaScriptProvider } from '@/lib/core/parsing/languages/javascript/index.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * A `.mjs` FILE IS JAVASCRIPT, AND NOBODY CLAIMED IT.
 *
 * Measured on the frozen orchestrator subject: 27 `.mjs` files each got a UNIT node from discovery
 * and ZERO symbols inside — every one of the 24 remaining "author wrote a doc, conducks has no node
 * at that line" cases in the doc-fidelity report was a `scripts/qa/*.mjs` file. The grammar parses
 * the dialect natively; the file simply never reached it, because both dispatch maps (registry and
 * pulse-worker) are built FROM `provider.extensions` and no provider listed the module-flavoured
 * extensions: `.mjs`/`.cjs` for JavaScript, `.mts`/`.cts` for TypeScript.
 *
 * The extension lists are the dispatch table by construction, which is why asserting on them is
 * asserting on dispatch and not on a constant.
 */
describe('module-flavoured extensions', () => {
  it('JavaScript claims .mjs and .cjs', () => {
    const ext = new JavaScriptProvider().extensions;
    expect(ext).toContain('.mjs');
    expect(ext).toContain('.cjs');
  });

  it('TypeScript claims .mts and .cts', () => {
    const ext = new TypeScriptProvider().extensions;
    expect(ext).toContain('.mts');
    expect(ext).toContain('.cts');
  });

  /** The grammar itself must swallow the dialect — dispatch alone is not the whole claim. */
  it('parses an .mjs file to real symbols', async () => {
    await grammars.loadLanguage('javascript');
    const reflector = new ConducksReflector();
    const spectrum = await reflector.reflect(
      {
        path: '/repo/fixtures.mjs',
        source: `
/** Builds the expert fixture. */
export async function buildExpert(env) {
  return env;
}
export const seed = async (client) => client.run();
`,
      },
      new JavaScriptProvider() as never,
      new AnalyzeContext(),
      ['/repo/fixtures.mjs']
    );
    const names = spectrum.nodes.map((n: any) => n.name);
    expect(names).toContain('buildExpert');
    expect(names).toContain('seed');
    expect(spectrum.nodes.find((n: any) => n.name === 'buildExpert')?.metadata.doc)
      .toBe('Builds the expert fixture.');
  });
});
