import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * todo62 — an ALIASES edge must name the node the same match mints.
 *
 * A destructured dynamic import mints a binding node whose id carries its ENCLOSING SCOPE
 * (`<file>::main2.doit`, written by `saveNodes` and confirmed in the SQL write log), while
 * `processAlias` was handed the bare local name, which `graph-engine.ts` turns into `<file>::doit`.
 * The edge therefore referenced an id nothing stored, and three things followed from that one
 * mismatch:
 *
 *   - the ATOM edge-gate in `pruneTaxonomy` counts only edges whose endpoint IS the node, so the
 *     binding looked unreferenced and was deleted;
 *   - prune's own cleanup deletes edges touching a dropped id, and the alias edge did not touch it;
 *   - so a confidence-1.0 edge outlived its own node — 3 of them in this repository, the entire
 *     residue of the referential-integrity audit once the query itself was corrected.
 *
 * The assertion is on the SOURCE NAME rather than on the absence of dangling edges, because the
 * dangle is two layers downstream (graph build, then prune) and only the vault can show it. This is
 * the layer where the fact is decided. `tests/database/ts/structural.test.ts` asserts the outcome
 * against the real vault; it skips on a fresh clone, which is why this exists as well.
 */
describe('an ALIASES edge is built against the id its node is stored under', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();
  const TARGET = '/repo/server.ts';

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  const aliases = async (source: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/caller.ts', source };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path, TARGET]);
    return spectrum.relationships
      .filter((r: any) => r.type === 'ALIASES')
      .map((r: any) => String(r.sourceName).toLowerCase());
  };

  it('scopes the alias when a RENAMED destructured import sits inside a function', async () => {
    expect(await aliases(`
      export async function main2() {
        const { helper: doIt } = await import("./server.js");
        return doIt();
      }
    `)).toEqual(['main2.doit']);
  });

  it('scopes the alias when a SHORTHAND destructured import sits inside a function', async () => {
    expect(await aliases(`
      export async function main() {
        const { Server } = await import("./server.js");
        return new Server();
      }
    `)).toEqual(['main.server']);
  });

  it('leaves a module-level re-export unscoped, because its node is unscoped too', async () => {
    // The 57 alias edges that were always healthy are this shape. Scoping them would have been the
    // same bug pointed the other way, so the identity case is asserted rather than assumed.
    expect(await aliases(`export { helper } from "./server.js";`)).toEqual(['helper']);
  });
});
