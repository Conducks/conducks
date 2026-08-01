/**
 * todo25 — four nodes carried a `parentId` pointing at an id that is not in `nodes`, and the todo
 * said the fix depended on whether the SWEEP or the WRITE was at fault, with no reproduction built.
 *
 * It is the write, and the reproduction is one line of source. Both offending files declare TWO
 * top-level symbols on ONE line:
 *
 *     struct User {} fn main() {}          tests/polyglot-verify/main.rs
 *     struct S { int x; }; void f() {}     tests/polyglot-verify/core.c
 *
 * `getScopeAt` filters candidate scopes by ROW only, so on a shared line each sibling passes the
 * other's test and both `user.main` and `main.user` get created — each naming the other as parent,
 * and neither `user` nor `main` existing standalone because both were consumed as children. The
 * self-containment guard beside it only excludes a scope the declaration CONTAINS; it never
 * required that the scope contain the declaration.
 */
import { describe, it, expect } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { registry as bootstrapped } from '@/registry/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

const reflect = async (file: string, source: string) => {
  const reg = (bootstrapped as any).infrastructure.registry;
  const provider = reg.getProvider(file);
  if (!provider) return null;
  if (provider.langId) await grammars.loadLanguage(provider.langId);
  return new ConducksReflector().reflect({ path: file, source }, provider, new AnalyzeContext(), [file]);
};

/**
 * The scope lands in the node ID, not the name: a method is `holder.inner` with name `inner`. The
 * first version of this test asserted on NAMES, which are never dotted for a nested symbol, so it
 * failed against a correct fix and then passed for the wrong reason.
 */
const idTail = (n: any): string => String(n.metadata?.id ?? '').split('::').pop() ?? '';
const parentTail = (n: any): string => String(n.metadata?.parentId ?? '').split('::').pop() ?? '';
const symbols = (spectrum: any) =>
  spectrum.nodes.filter((n: any) => idTail(n) !== 'unit' && idTail(n) !== '');

describe('two top-level symbols on one line (todo25)', () => {
  it('makes one-line siblings siblings, not each other parent — Rust', async () => {
    const spectrum = await reflect('/tmp/probe/main.rs', 'struct User {} fn main() {}\n');
    if (!spectrum) return;

    // The defect produced ids `user.main` and `main.user`, each naming the other as parent, and
    // neither `user` nor `main` surviving standalone because both were consumed as children.
    const ids = symbols(spectrum).map(idTail).sort();
    expect(ids).toEqual(['main', 'user']);
    for (const n of symbols(spectrum)) expect(parentTail(n)).toBe('unit');
  });

  it('makes one-line siblings siblings, not each other parent — C', async () => {
    const spectrum = await reflect('/tmp/probe/core.c', 'struct S { int x; }; void f() {}\n');
    if (!spectrum) return;

    // `s.x` is CORRECT here — `x` is a field genuinely inside `struct S`. Banning every dot would
    // forbid real nesting too, which is the mistake the first version of this assertion made. The
    // defect is specifically the two SIBLINGS claiming each other.
    const ids = symbols(spectrum).map(idTail);
    expect(ids).not.toContain('s.f');
    expect(ids).not.toContain('f.s');
    expect(ids).toContain('s');
    expect(ids).toContain('f');
  });

  it('STILL nests a genuinely enclosed symbol, so the fix is not just disabling nesting', async () => {
    const spectrum = await reflect('/tmp/probe/n.ts', 'class Holder {\n  inner() {}\n}\n');
    if (!spectrum) return;

    const inner = symbols(spectrum).find((n: any) => String(n.name) === 'inner');
    expect(inner).toBeDefined();
    expect(idTail(inner)).toBe('holder.inner');
    expect(parentTail(inner)).toBe('holder');
  });
});
