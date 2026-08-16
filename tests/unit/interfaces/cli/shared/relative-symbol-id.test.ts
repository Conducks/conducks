import { describe, it, expect } from '@jest/globals';
import { tryResolveSymbol, type NameIndex } from '@/interfaces/cli/shared/error.js';

/**
 * A qualified id must be qualified BY the file it names, and it was not.
 *
 * Node ids are absolute (`/abs/path/src/kernel/index.ts::createlogger`), so a relative id — which is
 * what `status` PRINTS, and what a reader naturally types — matched no id lookup, and resolution
 * fell through to the bare name after `::`. The file half was therefore ignored entirely:
 *
 *   impact "src/kernel/index.ts::createLogger"   -> picked src/kernel/logger/index.ts
 *   impact "does/not/exist.ts::createLogger"     -> IDENTICAL output
 *
 * Measured on a real subject with two `createLogger` declarations. It looked like it worked whenever
 * the bare name happened to be unique, which is most of the time — and `error.ts` already carries the
 * rule this broke: "the id a command PRINTS must be an id its sibling commands ACCEPT".
 *
 * The bare-name fallback stays for `MyClass::method`, which is not a path and never was (ADR 0106).
 * The difference is whether the left side looks like a file.
 */
const ROOT = '/abs/project';
const nodes = [
  { id: `${ROOT}/src/kernel/logger/index.ts::createlogger`, properties: { name: 'createLogger', canonicalKind: 'BEHAVIOR', gravity: 0.9 } },
  { id: `${ROOT}/src/kernel/index.ts::createlogger`, properties: { name: 'createLogger', canonicalKind: 'BEHAVIOR', gravity: 0.1 } },
  { id: `${ROOT}/src/only/here.ts::solo`, properties: { name: 'solo', canonicalKind: 'BEHAVIOR', gravity: 0.5 } },
  { id: '/private/abs/project/src/deep/x.ts::deep', properties: { name: 'deep', canonicalKind: 'BEHAVIOR', gravity: 0.5 } },
];

const graph: NameIndex = {
  findNodesByName: (name: string) => nodes.filter(n => n.properties.name.toLowerCase() === name.toLowerCase()) as any,
  getNode: (id: string) => nodes.find(n => n.id === id) as any,
};

describe('a relative file::symbol id selects that file', () => {
  it('picks the file named, not the highest-gravity one', () => {
    // Without the fix this answers with the logger/index.ts declaration, because gravity decides.
    expect(tryResolveSymbol('src/kernel/index.ts::createLogger', graph))
      .toBe(`${ROOT}/src/kernel/index.ts::createlogger`);
  });

  it('picks the other one when that is the file named', () => {
    expect(tryResolveSymbol('src/kernel/logger/index.ts::createLogger', graph))
      .toBe(`${ROOT}/src/kernel/logger/index.ts::createlogger`);
  });

  it('refuses a path that names no file holding that symbol', () => {
    // The sharp case: this used to return the gravity pick, so a typo answered confidently about a
    // different symbol. A stated file that holds nothing is a miss, not a hint.
    expect(tryResolveSymbol('does/not/exist.ts::createLogger', graph)).toBeNull();
  });

  it('still resolves an absolute id verbatim', () => {
    expect(tryResolveSymbol(`${ROOT}/src/only/here.ts::solo`, graph))
      .toBe(`${ROOT}/src/only/here.ts::solo`);
  });

  it('still falls back to the bare name for a NON-path qualifier', () => {
    // The counter-test. `MyClass::method` is not a path and never was — the fallback that ADR 0106
    // added for it must survive, or this fix trades one broken input for another.
    expect(tryResolveSymbol('MyClass::solo', graph)).toBe(`${ROOT}/src/only/here.ts::solo`);
  });

  it('resolves an absolute id whose prefix is a symlink', () => {
    // macOS hands out `/var/folders/...` while the resolved form the vault stores is
    // `/private/var/folders/...`. The first version of this fix compared with the leading slash
    // kept, so an absolute id matched nothing and this branch reported SYMBOL_NOT_FOUND for a
    // symbol that exists — six rename tests, every one passing a real absolute id.
    // Both directions: the vault may hold the resolved path while the reader types the short one,
    // or the reverse. `deep` is stored with the `/private` prefix, `solo` without it.
    expect(tryResolveSymbol('/abs/project/src/deep/x.ts::deep', graph))
      .toBe('/private/abs/project/src/deep/x.ts::deep');
    expect(tryResolveSymbol('/private/abs/project/src/only/here.ts::solo', graph))
      .toBe(`${ROOT}/src/only/here.ts::solo`);
  });

  it('still resolves a bare name', () => {
    expect(tryResolveSymbol('solo', graph)).toBe(`${ROOT}/src/only/here.ts::solo`);
  });
});
