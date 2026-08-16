import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector, ParseFailure } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/index.js";
import { grammars } from "@/lib/core/parsing/index.js";

/**
 * ADR 0089 — a file that cannot be read structurally FAILS, and is reported.
 *
 * There used to be a regex fallback ("Gnosis") behind six separate error paths: no parser, a parse
 * crash, a missing grammar, a query that would not compile, a query that compiled to nothing, and a
 * query that crashed against the tree. Every one of them silently produced a spectrum with nodes and
 * almost no edges.
 *
 * That is the worst failure mode available. The graph stays populated, so nothing looks broken, and
 * the file's symbols merely appear to have no relationships — indistinguishable from code that
 * genuinely has none. A malformed query in THIS repository degraded to regex FOR EVERY FILE and the
 * pulse still reported success.
 *
 * It never fired on either measured subject, which is the other half of the argument: the fallback
 * was carrying no load and hiding the one thing worth knowing.
 */
describe('an unreadable file fails loudly', () => {
  const reflector = new ConducksReflector();

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  const reflectWith = (provider: unknown, source = 'export const a = 1;') =>
    reflector.reflect({ path: '/repo/a.ts', source }, provider as never, new AnalyzeContext(), ['/repo/a.ts']);

  /**
   * The case that matters most, because it is a defect in THIS repository rather than in the file
   * being read: a query that does not compile. The field-order trap (memory.md) produces exactly
   * this, and it used to degrade to regex per file — so a broken query looked like sparse code.
   */
  it('throws when the language query is invalid', async () => {
    const provider = { ...new TypeScriptProvider(), queryScm: '(this_is_not_a_node) @name' };
    await expect(reflectWith(provider)).rejects.toThrow(ParseFailure);
  });

  it('names the file, the language and the reason', async () => {
    const provider = { ...new TypeScriptProvider(), queryScm: '(this_is_not_a_node) @name' };
    await expect(reflectWith(provider)).rejects.toThrow(/cannot read \/repo\/a\.ts as typescript: the language query is invalid/);
  });

  /** A language with no registered parser is a configuration failure, not a quiet degradation. */
  it('throws when no parser is registered for the language', async () => {
    const provider = { ...new TypeScriptProvider(), langId: 'no-such-language' };
    await expect(reflectWith(provider)).rejects.toThrow(ParseFailure);
  });

  /**
   * The control. A perfectly good file must still reflect — a failure path that fires on healthy
   * input would be worse than the fallback it replaced.
   */
  it('reflects a valid file without throwing', async () => {
    const spectrum = await reflectWith(new TypeScriptProvider(), 'export function f(a: string) { return a; }');
    expect(spectrum.nodes.some((n: { name?: unknown }) => String(n.name).toLowerCase() === 'f')).toBe(true);
  });

  /** `ParseFailure` carries its parts as fields, so a caller can report them without parsing prose. */
  it('carries the file, language and reason as fields', async () => {
    const provider = { ...new TypeScriptProvider(), queryScm: '(this_is_not_a_node) @name' };
    const error = await reflectWith(provider).catch((e: unknown) => e as ParseFailure);
    expect(error).toBeInstanceOf(ParseFailure);
    expect((error as ParseFailure).filePath).toBe('/repo/a.ts');
    expect((error as ParseFailure).langId).toBe('typescript');
    expect((error as ParseFailure).reason).toContain('query is invalid');
  });
});
