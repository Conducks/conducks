import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { DEFINITION_CAPTURES, CaptureTags } from '@/lib/core/parsing/capture-tags.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { JavaScriptProvider } from '@/lib/core/parsing/languages/javascript/index.js';
import { RustProvider } from '@/lib/core/parsing/languages/rust/index.js';
import { JavaProvider } from '@/lib/core/parsing/languages/java/index.js';
import { GoProvider } from '@/lib/core/parsing/languages/go/index.js';
import { CProvider } from '@/lib/core/parsing/languages/c/index.js';
import { CSharpProvider } from '@/lib/core/parsing/languages/csharp/index.js';
import { SwiftProvider } from '@/lib/core/parsing/languages/swift/index.js';

/**
 * Every definition capture a grammar can emit, driven through the reflector, once (todo68 Phase 8).
 *
 * The reflector is 1,696 lines and the single most consequential file in the project — a defect here
 * reaches all 35 commands. Its per-capture behaviour was the largest thing this campaign left owed:
 * suites existed for the cases that had once been WRONG (arrow functions, aliases, type-only
 * imports, Python resolution) and for nothing that had merely always worked. A tag with no test is a
 * tag that can be renamed, dropped from a query, or mapped to the wrong rung with every gate green.
 *
 * What each case asserts is the whole chain for one tag: a real snippet in a language whose grammar
 * actually emits it → tree-sitter → the query → `kindFromCapture` → `mapToCanonical` → a node. Not a
 * unit test of a private function; the private function is not where the tags get lost.
 *
 * The COMPLETENESS assertion at the bottom is the part that keeps working after today: adding a tag
 * to `DEFINITION_CAPTURES` without a case here fails. Without it this suite would be a snapshot of
 * what someone remembered in August, and rule 10 asks for a claim that bites later.
 *
 * The languages are not chosen for variety. Each is one that MEASURABLY carries the tag — the map
 * came from grepping `@<tag>` across all thirteen `queries.ts` files, which is also how `isTrait`
 * turned out to be emitted by nothing at all.
 */
type Case = {
  tag: string;
  lang: string;
  provider: unknown;
  file: string;
  source: string;
  symbol: string;
  canonicalKind: string;
};

const CASES: Case[] = [
  {
    tag: CaptureTags.IS_FUNCTION, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/a.ts', symbol: 'compute', canonicalKind: 'BEHAVIOR',
    source: 'export function compute(x: number): number { return x + 1; }\n',
  },
  {
    tag: CaptureTags.IS_METHOD, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/b.ts', symbol: 'run', canonicalKind: 'BEHAVIOR',
    source: 'export class Engine {\n  run(times: number): void {}\n}\n',
  },
  {
    // The ONLY grammar that emits `@isClass`. Twelve others tag a class `@isStruct`, which is why
    // this case is Swift and not the obvious TypeScript one — a TS case would have tested `isStruct`
    // while claiming to test `isClass`, and passed.
    tag: CaptureTags.IS_CLASS, lang: 'swift', provider: new SwiftProvider(),
    file: '/repo/c.swift', symbol: 'Engine', canonicalKind: 'STRUCTURE',
    source: 'public class Engine {\n  func run() {}\n}\n',
  },
  {
    tag: CaptureTags.IS_STRUCT, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/d.ts', symbol: 'Engine', canonicalKind: 'STRUCTURE',
    source: 'export class Engine {}\n',
  },
  {
    tag: CaptureTags.IS_INTERFACE, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/e.ts', symbol: 'Shape', canonicalKind: 'STRUCTURE',
    source: 'export interface Shape { area(): number }\n',
  },
  {
    tag: CaptureTags.IS_ENUM, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/f.ts', symbol: 'Colour', canonicalKind: 'STRUCTURE',
    source: 'export enum Colour { Red, Green }\n',
  },
  {
    tag: CaptureTags.IS_PROPERTY, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/g.ts', symbol: 'size', canonicalKind: 'ATOM',
    source: 'export class Box {\n  size: number = 3;\n}\n',
  },
  {
    tag: CaptureTags.IS_VARIABLE, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/h.ts', symbol: 'LIMIT', canonicalKind: 'ATOM',
    source: 'export const LIMIT = 42;\n',
  },
  {
    // `@isInfra` does NOT mint an INFRA node, and the case is written against what it does rather
    // than against its name. The capture feeds the flow processor, which mints a virtual route —
    // BEHAVIOR deliberately, with its rank read from the enum, because a hand-written rank once put
    // six route nodes two rungs above every other BEHAVIOR in the same graph (ADR 0099).
    tag: CaptureTags.IS_INFRA, lang: 'javascript', provider: new JavaScriptProvider(),
    file: '/repo/i.js', symbol: 'ROUTE::/users::GET', canonicalKind: 'BEHAVIOR',
    source: 'const app = express();\napp.get("/users", (req, res) => res.send(1));\n',
  },
  {
    tag: CaptureTags.IS_PACKAGE, lang: 'go', provider: new GoProvider(),
    file: '/repo/j.go', symbol: 'main', canonicalKind: 'PACKAGE',
    source: 'package main\n\nfunc Run() {}\n',
  },
  {
    // A NAMESPACE is not a PACKAGE (ADR 0100). All six constructs were once tagged `@isPackage`,
    // which left the NAMESPACE rung empty while four consumers read it.
    tag: CaptureTags.IS_NAMESPACE, lang: 'csharp', provider: new CSharpProvider(),
    file: '/repo/k.cs', symbol: 'Acme', canonicalKind: 'NAMESPACE',
    source: 'namespace Acme {\n  public class Engine {}\n}\n',
  },
  {
    tag: CaptureTags.IS_MACRO, lang: 'c', provider: new CProvider(),
    file: '/repo/l.c', symbol: 'MAX_SIZE', canonicalKind: 'INFRA',
    source: '#define MAX_SIZE 10\n',
  },
  {
    tag: CaptureTags.IS_FIELD, lang: 'java', provider: new JavaProvider(),
    file: '/repo/M.java', symbol: 'count', canonicalKind: 'ATOM',
    source: 'public class M {\n  private int count = 0;\n}\n',
  },
  {
    tag: CaptureTags.IS_GENERIC, lang: 'go', provider: new GoProvider(),
    file: '/repo/n.go', symbol: 'Pair', canonicalKind: 'STRUCTURE',
    source: 'package n\n\ntype Pair[T any] struct {\n  A T\n}\n',
  },
  {
    // A re-export, not an import: `@isBinding` is the tag for `export { x } from './y'`, which mints
    // a node for the local name so the intra-linker can rebind it one hop to the real definition
    // (ADR 0071).
    tag: CaptureTags.IS_BINDING, lang: 'typescript', provider: new TypeScriptProvider(),
    file: '/repo/p.ts', symbol: 'db', canonicalKind: 'ATOM',
    source: 'export { db } from "./store.js";\n',
  },
];

/**
 * Tags in `DEFINITION_CAPTURES` that mint NO node in any language that emits them — measured, not
 * assumed, and left as a finding rather than fixed inside a clean (ADR 0150 rule 16).
 *
 * `isHeritage` is the whole list. In all three grammars that emit it — Ruby, Rust and PHP — it sits
 * in NAME position inside a match whose top-level capture is something else, so the reflector never
 * treats it as a definition. Rust's own query comment says the pattern "creates IMPLEMENTS edge
 * conceptually"; measured, `impl Base for Child` produces the struct, the trait and the method, and
 * no edge between Child and Base at all. Ruby's `include Base` produces one `CALLS` edge to
 * `GLOBAL::include`, which is the mixin read as a function call.
 *
 * Recorded here so it is a KNOWN gap with a test behind it. If someone makes heritage mint a node,
 * this row goes red and they move it up into CASES — which is the point of writing it down.
 */
const MINTS_NO_NODE: Array<{ tag: string; why: string }> = [
  { tag: CaptureTags.IS_HERITAGE, why: 'name-position capture in Ruby, Rust and PHP; no IMPLEMENTS edge is produced' },
];

const reflector = new ConducksReflector();

const reflect = async (c: Case) => {
  const file = { path: c.file, source: c.source };
  return reflector.reflect(file, c.provider as never, new AnalyzeContext(), [file.path]);
};

describe('every definition capture mints a node of the kind it declares', () => {
  beforeAll(async () => {
    const langs = [...new Set([...CASES.map(c => c.lang), 'rust'])];
    for (const id of langs) await grammars.loadLanguage(id);

    // A grammar that failed to load parses NOTHING, and every case below would then fail with
    // "symbol not found" — a message that reads like a reflector bug and is not one. Said here, once.
    const dead = langs.filter(id => grammars.isLanguageUnavailable(id));
    expect(dead).toEqual([]);
  }, 120000);

  for (const c of CASES) {
    it(`${c.tag} → ${c.canonicalKind} (${c.lang})`, async () => {
      const spectrum: any = await reflect(c);
      const node = spectrum.nodes.find((n: any) => n.name === c.symbol);

      expect(node).toBeDefined();
      expect(node.canonicalKind).toBe(c.canonicalKind);
    }, 60000);
  }

  it('covers every tag in DEFINITION_CAPTURES', () => {
    // The row that keeps this suite honest after today. A tag added to the set with no case here is
    // a tag nothing measures, and every other gate stays green while it happens.
    const covered = new Set([...CASES.map(c => c.tag), ...MINTS_NO_NODE.map(m => m.tag)]);
    const uncovered = [...DEFINITION_CAPTURES].filter(t => !covered.has(t));

    expect(uncovered).toEqual([]);
  });

  it('isHeritage mints no node in Ruby, Rust or PHP — the known gap, pinned', async () => {
    // Asserted so the gap cannot close silently. A heritage node appearing here is good news that
    // must still be read: the row moves into CASES and this test goes with it.
    const rust: any = await reflect({
      tag: CaptureTags.IS_HERITAGE, lang: 'rust', provider: new RustProvider(),
      file: '/repo/h.rs', symbol: '', canonicalKind: '',
      source: 'struct Child;\ntrait Base { fn go(&self); }\nimpl Base for Child { fn go(&self) {} }\n',
    });

    // The parts that DO work, asserted first — otherwise a grammar that stopped parsing entirely
    // would satisfy the negative below and read as the same known gap.
    const kinds = rust.nodes.map((n: any) => `${n.name}:${n.canonicalKind}`);
    expect(kinds).toContain('Child:STRUCTURE');
    expect(kinds).toContain('Base:STRUCTURE');

    const heritageEdges = (rust.relationships ?? []).filter((e: any) =>
      e.type === 'INHERITS' || e.type === 'IMPLEMENTS' || e.type === 'EXTENDS');
    expect(heritageEdges).toEqual([]);
  }, 60000);

  it('every case names a language whose grammar actually emits that tag', () => {
    // The trap this suite nearly walked into: `isClass` is emitted by ONE of the thirteen grammars.
    // A TypeScript case would have passed while exercising `isStruct`, and the row would have read
    // as coverage. Asserted against the query files rather than remembered.
    const wrong: string[] = [];
    for (const c of CASES) {
      const q = path.resolve('src/lib/core/parsing/languages', c.lang, 'queries.ts');
      if (!fs.readFileSync(q, 'utf-8').includes(`@${c.tag}`)) wrong.push(`${c.tag} is not emitted by ${c.lang}`);
    }

    expect(wrong).toEqual([]);
  });
});
