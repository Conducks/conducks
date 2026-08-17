import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector, AnalyzeContext, grammars } from '@/lib/core/parsing/index.js';
import { TypeScriptProvider } from '@/lib/core/parsing/index.js';
import { PHPProvider } from '@/lib/core/parsing/index.js';
import { RubyProvider } from '@/lib/core/parsing/index.js';
import { RustProvider } from '@/lib/core/parsing/index.js';

/**
 * Inheritance produces an edge in every language that has inheritance.
 *
 * Three of them did not. Measured, not inferred: TypeScript emitted EXTENDS and IMPLEMENTS
 * correctly, and Ruby, Rust and PHP emitted NOTHING — not a wrong edge, no edge at all. PHP had no
 * heritage pattern of any kind, so `class Child extends Base` had never once produced a relation.
 *
 * All three failed the SAME way, and TypeScript's query file had already written down the rule that
 * catches it: `@heritage` must be co-captured with `@name` in the same pattern, because the
 * reflector only processes a heritage capture when the match also resolves a definition node. A
 * standalone pattern compiles, captures the supertype, and is dropped in silence. Rust's query even
 * said its pattern "creates IMPLEMENTS edge conceptually" — conceptually was the whole problem.
 *
 * The cost of the gap: `audit`, `arch` and every containment walk read a Ruby, Rust or PHP codebase
 * as having no type hierarchy whatsoever, which is indistinguishable from a codebase that genuinely
 * has none.
 *
 * A NEGATIVE CASE PER LANGUAGE, because "emit an edge" is trivially satisfiable by emitting one
 * everywhere. Rust's inherent `impl Child {}` has no trait and must stay silent; a plain Ruby class
 * with no superclass likewise.
 */
const reflector = new ConducksReflector();

const heritageOf = async (lang: string, provider: unknown, file: string, source: string) => {
  const f = { path: file, source };
  const spectrum: any = await reflector.reflect(f, provider as never, new AnalyzeContext(), [f.path]);
  return (spectrum.relationships ?? [])
    .filter((e: any) => e.type === 'EXTENDS' || e.type === 'IMPLEMENTS')
    .map((e: any) => `${e.type} ${e.sourceName}->${e.targetName}`);
};

beforeAll(async () => {
  for (const id of ['typescript', 'php', 'ruby', 'rust']) await grammars.loadLanguage(id);
}, 120000);

describe('a supertype becomes an edge, and the CLAUSE decides which kind', () => {
  it('typescript — the pack that already worked, kept as the reference', async () => {
    expect(await heritageOf('typescript', new TypeScriptProvider(), '/r/a.ts', 'class Child extends Base {}\n'))
      .toEqual(['EXTENDS Child->Base']);
    expect(await heritageOf('typescript', new TypeScriptProvider(), '/r/b.ts', 'class Child implements Shape {}\n'))
      .toEqual(['IMPLEMENTS Child->Shape']);
  }, 60000);

  it('php — extends, implements, and both at once', async () => {
    const php = () => new PHPProvider();
    expect(await heritageOf('php', php(), '/r/c.php', '<?php\nclass Child extends Base {}\n'))
      .toEqual(['EXTENDS Child->Base']);
    expect(await heritageOf('php', php(), '/r/d.php', '<?php\nclass Child implements Shape {}\n'))
      .toEqual(['IMPLEMENTS Child->Shape']);

    // Both clauses on one class are SIBLING nodes in the tree, matched by two separate patterns.
    // A single merged pattern would capture only whichever came first.
    expect((await heritageOf('php', php(), '/r/e.php', '<?php\nclass Child extends Base implements Shape {}\n')).sort())
      .toEqual(['EXTENDS Child->Base', 'IMPLEMENTS Child->Shape']);
  }, 60000);

  it('ruby — `<` is inheritance, `include` is a mixin, and they are not the same relation', async () => {
    const ruby = () => new RubyProvider();
    expect(await heritageOf('ruby', ruby(), '/r/f.rb', 'class Child < Base\nend\n'))
      .toEqual(['EXTENDS Child->Base']);

    // A module contributes behaviour without being the parent, so a mixin is IMPLEMENTS. Collapsing
    // both onto EXTENDS would make every Ruby class look like it had several parents.
    expect(await heritageOf('ruby', ruby(), '/r/g.rb', 'class Child\n  include Base\nend\n'))
      .toEqual(['IMPLEMENTS Child->Base']);
  }, 60000);

  it('rust — a trait impl is IMPLEMENTS', async () => {
    expect(await heritageOf('rust', new RustProvider(), '/r/h.rs', 'struct Child;\ntrait Base {}\nimpl Base for Child {}\n'))
      .toEqual(['IMPLEMENTS Child->Base']);
  }, 60000);
});

describe('and stays silent where there is no supertype', () => {
  it('rust: an inherent impl has no trait, so no edge', async () => {
    // `impl Child {}` adds methods to a type. Reading it as inheritance would give every Rust type
    // with its own methods a fabricated relation to itself.
    expect(await heritageOf('rust', new RustProvider(), '/r/i.rs', 'struct Child;\nimpl Child {}\n'))
      .toEqual([]);
  }, 60000);

  it('ruby: a class with no superclass and no mixin', async () => {
    expect(await heritageOf('ruby', new RubyProvider(), '/r/j.rb', 'class Plain\nend\n')).toEqual([]);
  }, 60000);

  it('php: a class declaring neither clause', async () => {
    expect(await heritageOf('php', new PHPProvider(), '/r/k.php', '<?php\nclass Plain {}\n')).toEqual([]);
  }, 60000);
});
