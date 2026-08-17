import { describe, it, expect } from '@jest/globals';
import fs, { readFileSync, readdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CProvider, CPPProvider, CSharpProvider, GoProvider, JavaProvider, JavaScriptProvider,
  PHPProvider, PythonProvider, RubyProvider, RustProvider, SwiftProvider, TSXProvider,
  TypeScriptProvider,
} from '@/lib/core/parsing/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { scm } from '@/lib/core/parsing/languages/scm.js';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';

/**
 * The patterns live in `.scm` files now, and a BACKTICK in one is an ordinary character (todo31).
 *
 * This file replaces `backticks-in-queries.test.ts`, which asserted the exact opposite: that no
 * query file may contain a backtick. That was a real rule for as long as the patterns lived inside
 * TypeScript template literals, where a backtick ends the string and `tsc` reports `TS1005: ','
 * expected` pointing at query text. It fired ten times in ten days and needed a pre-build gate to be
 * survivable. Both the gate and that test are deleted, which is this todo's stated acceptance.
 *
 * So the claim here is the inverse one, and it has to be checked the same way: that a backtick
 * genuinely round-trips into a COMPILED query, not merely that a file on disk contains one.
 */
const LANGS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/lib/core/parsing/languages');

const PACKS: Array<[string, { langId: string; queryScm: string }]> = [
  ['c', new CProvider()], ['cpp', new CPPProvider()], ['csharp', new CSharpProvider()],
  ['go', new GoProvider()], ['java', new JavaProvider()], ['javascript', new JavaScriptProvider()],
  ['php', new PHPProvider()], ['python', new PythonProvider()], ['ruby', new RubyProvider()],
  ['rust', new RustProvider()], ['swift', new SwiftProvider()], ['tsx', new TSXProvider()],
  ['typescript', new TypeScriptProvider()],
];

describe('every pack reads its patterns from a file beside it', () => {
  it('finds all thirteen — a check that ran over none is not a pass (ADR 0044)', () => {
    const dirs = readdirSync(LANGS, { withFileTypes: true }).filter(e => e.isDirectory());
    const withScm = dirs.filter(e => existsSync(path.join(LANGS, e.name, 'queries.scm')));
    expect(withScm.length).toBe(13);
    expect(PACKS.length).toBe(13);
  });

  for (const [lang, provider] of PACKS) {
    it(`${lang}: the loaded query text is non-empty and holds real patterns`, () => {
      // An unreadable file would throw; an EMPTY one would not, and a pack whose query compiles to
      // nothing captures nothing while every gate stays green — the shape ADR 0089 exists for.
      expect(provider.queryScm.length).toBeGreaterThan(200);
      expect(provider.queryScm).toMatch(/@name/);
    });
  }
});

describe('a backtick in a query file is now an ordinary character', () => {
  it('at least one pack ships a backtick in its patterns, so the claim is not vacuous', () => {
    const withBacktick = PACKS
      .map(([lang]) => [lang, readFileSync(path.join(LANGS, lang, 'queries.scm'), 'utf8')] as const)
      .filter(([, src]) => src.includes('`'));

    expect(withBacktick.length).toBeGreaterThan(0);
  });

  it('the backtick survives into a real PARSE, which is the half a file check cannot see', async () => {
    // Reading a file proves the character is on disk. It does not prove the pack loaded that file,
    // that the loader kept the character, or that tree-sitter compiles the result. Reflecting real C
    // source closes all three at once, and it is the only assertion here that could fail if the
    // migration were subtly wrong — a query that fails to compile drops the language to the regex
    // fallback and still returns nodes, so the COUNT is what says the real query ran.
    const c = new CProvider();
    expect(c.queryScm).toContain('`');

    await grammars.loadLanguage('c');
    if (grammars.isLanguageUnavailable('c')) return;   // no native grammar on this machine

    const source = 'struct Account { int balance; };\nint post(struct Account *a) { return a->balance; }\n';
    const spectrum = await new ConducksReflector()
      .reflect({ path: '/p/main.c', source }, c as any, new AnalyzeContext(), ['/p/main.c']);

    const names = spectrum.nodes.map(n => String(n.name).toLowerCase());
    expect(names).toContain('post');
    expect(names).toContain('account');
  });
});

describe('the shared ECMAScript block is spliced in PLACE, not appended', () => {
  it('javascript keeps its own patterns AFTER the shared ones', () => {
    // `;; @include` marks the position, and the position is not cosmetic: two patterns matching the
    // same node race to create it (ADR 0086). javascript carries `assignment_pattern` after its
    // shared blocks, so appending everything at the end would change which pattern wins.
    const src = readFileSync(path.join(LANGS, 'javascript', 'queries.scm'), 'utf8');
    const include = src.indexOf(';; @include EC_VALUE_POSITIONS');
    const after = src.indexOf('(assignment_pattern');

    expect(include).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(include);

    // And in the LOADED text the shared patterns really are between the two halves.
    const loaded = new JavaScriptProvider().queryScm;
    expect(loaded).not.toContain('@include');
    expect(loaded.indexOf('(assignment_pattern')).toBeGreaterThan(loaded.indexOf('@ref_value'));
  });

  it('THROWS on an include the pack did not provide', () => {
    // The failure this guard prevents is silent: an unresolved marker left in place is a `;;`
    // comment, so the query still compiles and the pack simply loses every shared pattern. Driven
    // through a temp file because no real pack has a bad include — a guard with no case is a guard
    // nobody has seen work.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-scm-'));
    fs.writeFileSync(path.join(dir, 'q.scm'), '(identifier) @name\n;; @include NOT_PROVIDED\n');
    const moduleUrl = pathToFileURL(path.join(dir, 'loader.js')).href;

    expect(() => scm(moduleUrl, './q.scm', { SOMETHING_ELSE: '(x) @y' })).toThrow(/NOT_PROVIDED/);
    // And the same file resolves cleanly once the name IS provided, so the throw is about the
    // missing key and not about the file or the marker syntax.
    expect(scm(moduleUrl, './q.scm', { NOT_PROVIDED: '(call_expression) @kinesis_target' }))
      .toContain('@kinesis_target');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('splices the shared block the real packs name, and leaves no marker behind', () => {
    // The failure this guard prevents: an unknown name left in place would compile fine and lose
    // every shared pattern in that pack. `ecmascript-positions` exists because javascript was
    // missing `for_in_statement` for months and nothing compared the three copies.
    const provider = new JavaScriptProvider();
    expect(provider.queryScm).toContain('for_in_statement');
  });
});
