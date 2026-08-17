import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector, AnalyzeContext, grammars } from '@/lib/core/parsing/index.js';
import { RustProvider, GoProvider, CProvider, CSharpProvider } from '@/lib/core/parsing/index.js';

/**
 * Four constructs no pack captured, found by `oracle-packs.mjs` rather than by reading.
 *
 * The oracle walks each grammar exhaustively and asks why a declaration the tree plainly holds
 * minted no node. It named these, and every one is a symbol a person would search for:
 *
 *   rust · go · c   a TYPE ALIAS. `pub type AccountId = u64` names a type the code then refers to by
 *                   that name, so `query AccountId` found nothing and `impact` on it reported none.
 *   csharp          a STRUCT — as common in C# as a class, and entirely invisible.
 *   csharp          an ENUM MEMBER. `Status.Active` resolved to the enum; the member could not be
 *                   found or impacted on its own.
 *
 * None of this was visible to any other gate: the files parse, the packs load, the suite was green.
 * A query that stops matching a construct looks exactly like a project that does not use it.
 */
const reflector = new ConducksReflector();

const kindOf = async (lang: string, provider: unknown, file: string, source: string, name: string) => {
  const f = { path: file, source };
  const spectrum: any = await reflector.reflect(f, provider as never, new AnalyzeContext(), [f.path]);
  return spectrum.nodes.find((n: any) => n.name === name)?.canonicalKind ?? null;
};

beforeAll(async () => {
  for (const id of ['rust', 'go', 'c', 'csharp']) await grammars.loadLanguage(id);
}, 120000);

describe('a type alias is a type', () => {
  it('rust captures `type X = ...`', async () => {
    expect(await kindOf('rust', new RustProvider(), '/r/a.rs', 'pub type AccountId = u64;\n', 'AccountId'))
      .toBe('STRUCTURE');
  }, 60000);

  it('go captures `type X = ...`', async () => {
    expect(await kindOf('go', new GoProvider(), '/r/a.go', 'package p\ntype AccountID = uint64\n', 'AccountID'))
      .toBe('STRUCTURE');
  }, 60000);

  it('c captures a typedef', async () => {
    expect(await kindOf('c', new CProvider(), '/r/a.c', 'typedef unsigned long AccountId;\n', 'AccountId'))
      .toBe('STRUCTURE');
  }, 60000);

  it('does not turn a plain struct into an alias — the kinds stay distinct', async () => {
    // The counter-test. A pattern loose enough to catch aliases could swallow the struct
    // declaration beside it, and both would still be STRUCTURE, so only the NAME shows the mistake.
    const src = 'pub struct Account { id: u64 }\npub type AccountId = u64;\n';
    expect(await kindOf('rust', new RustProvider(), '/r/b.rs', src, 'Account')).toBe('STRUCTURE');
    expect(await kindOf('rust', new RustProvider(), '/r/b.rs', src, 'AccountId')).toBe('STRUCTURE');
  }, 60000);
});

describe('C# structs and enum members exist', () => {
  it('captures a struct', async () => {
    expect(await kindOf('csharp', new CSharpProvider(), '/r/A.cs',
      'public struct AccountId { public ulong Raw; }\n', 'AccountId')).toBe('STRUCTURE');
  }, 60000);

  it('captures each enum member as its own symbol', async () => {
    const src = 'public enum Status { Active, Frozen }\n';
    expect(await kindOf('csharp', new CSharpProvider(), '/r/B.cs', src, 'Active')).toBe('ATOM');
    expect(await kindOf('csharp', new CSharpProvider(), '/r/B.cs', src, 'Frozen')).toBe('ATOM');
  }, 60000);

  it('still captures the enum itself, not only its members', async () => {
    expect(await kindOf('csharp', new CSharpProvider(), '/r/C.cs',
      'public enum Status { Active }\n', 'Status')).toBe('STRUCTURE');
  }, 60000);
});
