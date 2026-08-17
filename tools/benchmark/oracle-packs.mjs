/**
 * Conducks — does each language pack capture what its grammar declares?
 *
 * Nine of the thirteen packs had no oracle. Their resolvers are tested and their providers load, so
 * the suite is green — but nothing checked whether a pack's QUERIES capture the right things. A pack
 * that silently stopped matching `enum_item` would keep parsing, keep passing, and quietly drop every
 * enum in every Rust project. That is the class of failure this scores.
 *
 * WHY NOT A COMPILER PER LANGUAGE. `javac`, `dotnet` and `php` are not installed on this machine and
 * should not have to be — an oracle that only runs where nine toolchains exist is an oracle nobody
 * runs. More importantly, it is not needed: tree-sitter ships `node-types.json` with every grammar,
 * which is the GRAMMAR'S OWN declaration of the node types it can produce. That file is written by
 * the grammar author, not by conducks, and it is exactly the independent second opinion an oracle
 * needs.
 *
 * WHY IT IS GENUINELY INDEPENDENT, which is the property that matters (see `oracle-python.mjs`).
 * Conducks matches a hand-written list of shapes. This WALKS EVERY NODE of the same tree and asks the
 * grammar which of them are declarations. Two different methods over one input. An oracle built the
 * same way as the thing it scores would share its blind spots.
 *
 * WHAT IT CHECKS. For each fixture: every declaration-shaped node the grammar produced that carries a
 * `name` field, against every symbol conducks minted for that file.
 *
 *   MISSED  the tree holds a named declaration, conducks minted nothing for it — a recall gap.
 *   EXTRA   conducks minted a symbol whose name appears in NO declaration node — a precision bug.
 *
 * HOW IT IS SCORED, and this is weaker than `oracle-python.mjs` on purpose.
 *
 * There, EXTRA is EXACT — a name the parser can see used, called stale, is wrong with no
 * interpretation. Here it is not, and claiming otherwise would be the flattering lie this file
 * exists to prevent. Reading a name out of a tree is per-grammar work: the identifier sits in a
 * direct field, or down a `declarator` chain, or one level into a `*_spec` child, and every wrong
 * guess surfaces as a false EXTRA against a pack that was right. Three separate rounds of that
 * happened while writing this, and the first reported all nine packs as catastrophically broken
 * because the reader returned nothing at all.
 *
 * So BOTH directions ratchet against a recorded baseline. Neither is treated as exact. What the
 * ratchet does catch is the thing worth catching: a pack that STOPS capturing something it captures
 * today, which is invisible to every other gate because the parse still succeeds.
 *
 * IT ALSO SCORES ONE EDGE CLASS: HERITAGE. Nodes are not the only thing a pack can silently stop
 * producing, and on 2026-08-17 three packs — ruby, rust and php — emitted no inheritance edge AT ALL.
 * Not a wrong edge: none. Every file parsed, every pack loaded, the suite was green, and `audit`,
 * `arch` and every containment walk read those codebases as having no type hierarchy — which is
 * indistinguishable from a codebase that genuinely has none.
 *
 * So: every pack whose queries mention a heritage capture must PRODUCE a heritage edge for a two-line
 * fixture that plainly has one. That is the check nothing was making.
 *
 * WHAT IT CANNOT SEE, stated rather than discovered later:
 *   - whether a captured node got the RIGHT KIND. `every-definition-capture-mints-its-kind.test.ts`
 *     covers that; this covers whether it was captured at all.
 *   - a declaration the grammar exposes without a readable name — an anonymous class, a destructured
 *     binding, a template parameter. Skipped rather than guessed at.
 *   - anything a fixture does not exercise. The fixtures ARE the denominator; the declared count is
 *     printed per pack so a shrinking one is visible rather than silently flattering.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FIXTURES = path.join(HERE, 'oracle-fixtures');
const BASELINE = path.join(HERE, 'oracle-packs-baseline.json');

/** Fixture per pack. The pack id is what `grammars.loadLanguage` and the provider are keyed on. */
const PACKS = [
  { lang: 'rust',   pkg: 'tree-sitter-rust',    file: 'sample.rs',     provider: 'RustProvider' },
  { lang: 'go',     pkg: 'tree-sitter-go',      file: 'sample.go',     provider: 'GoProvider' },
  { lang: 'java',   pkg: 'tree-sitter-java',    file: 'Sample.java',   provider: 'JavaProvider' },
  { lang: 'c',      pkg: 'tree-sitter-c',       file: 'sample.c',      provider: 'CProvider' },
  { lang: 'cpp',    pkg: 'tree-sitter-cpp',     file: 'sample.cpp',    provider: 'CPPProvider' },
  { lang: 'csharp', pkg: 'tree-sitter-c-sharp', file: 'Sample.cs',     provider: 'CSharpProvider' },
  { lang: 'php',    pkg: 'tree-sitter-php',     file: 'sample.php',    provider: 'PHPProvider' },
  { lang: 'ruby',   pkg: 'tree-sitter-ruby',    file: 'sample.rb',     provider: 'RubyProvider' },
  { lang: 'swift',  pkg: 'tree-sitter-swift',   file: 'Sample.swift',  provider: 'SwiftProvider' },
];

/**
 * A node type is declaration-shaped when the GRAMMAR names it so. Two corrections were forced by
 * measuring, and both were the instrument being wrong rather than a pack:
 *
 *   - RUBY names none of its declarations with these suffixes — they are `class`, `module`, `method`
 *     and `singleton_method`. The suffix rule scored it 0 declared against 9 minted, which reads as a
 *     catastrophic precision failure and is entirely the checker's fault. Ruby's real type names are
 *     listed rather than pattern-matched, because there is no pattern to match.
 *   - a PARAMETER is a declaration to every grammar here and is deliberately NOT a node in conducks:
 *     a signature lives on `dna.params` (ADR 0086). Counting them made Go report four misses that are
 *     the design working. Excluded by name, with the reason stated, rather than by tuning a threshold.
 */
const DECL_SUFFIX = ['_item', '_declaration', '_definition', '_specifier'];
const EXTRA_DECL_TYPES = {
  ruby:   ['class', 'module', 'method', 'singleton_method', 'singleton_class'],
  // `#define MAX_RETRIES 3` is a declaration in every sense that matters — conducks mints it as
  // INFRA — but the grammar calls it `preproc_def`, which no suffix rule catches.
  c:      ['preproc_def'],
  cpp:    ['preproc_def'],
  // A Swift enum case is `enum_entry`, and C#'s is `enum_member_declaration`; neither is optional
  // for a tool that reports enums.
  swift:  ['enum_entry'],
};
const NOT_A_SYMBOL = new Set([
  'parameter_declaration', 'optional_parameter_declaration', 'variadic_parameter_declaration',
  'method_parameters', 'capture_list_item', 'import_declaration', 'use_declaration',
  'attribute_item', 'inner_attribute_item', 'attribute_declaration', 'preproc_function_def',
]);

/** `node-types.json` moves around between grammar packages; try where each is known to keep it. */
const nodeTypesFor = (pkg) => {
  for (const rel of [`${pkg}/src/node-types.json`, `${pkg}/php/src/node-types.json`,
                     `${pkg}/common/src/node-types.json`]) {
    const p = path.join(ROOT, 'node_modules', rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  return null;
};

/** Every named declaration in the tree, walked exhaustively — the independent half. */
const declaredNames = (root, declTypes) => {
  const found = new Map();                       // name -> node type
  const walk = (n) => {
    if (declTypes.has(n.type)) {
      // Fields are read through `fieldNameForChild`, not `childByFieldName`. The latter exists on
      // this binding and returns undefined for every node — so the first version of this oracle
      // counted ZERO declarations and reported every symbol in all nine packs as EXTRA. A checker
      // whose denominator is empty reports 100% wrong and looks exactly like a catastrophic finding.
      // The name is not always a direct `name` field. In the C family a `function_definition` holds
      // a `declarator` chain and the identifier is at the bottom of it — so reading only the direct
      // field missed every C and C++ function, and they surfaced as EXTRA. Follow `declarator` down.
      const fieldOf = (node, want) => {
        for (let i = 0; i < node.childCount; i++) {
          if (node.fieldNameForChild?.(i) === want) return node.child(i);
        }
        return null;
      };
      let nameNode = fieldOf(n, 'name');
      let hop = n, guard = 0;
      while (!nameNode && hop && guard++ < 6) {
        hop = fieldOf(hop, 'declarator');
        if (!hop) break;
        nameNode = fieldOf(hop, 'name') ?? (hop.type === 'identifier' ? hop : null);
      }
      const keep = (t, type) => {
        const clean = String(t ?? '').trim().replace(/^[$@&*]+/, '');
        if (clean && /^[A-Za-z_][\w]*$/.test(clean) && !found.has(clean.toLowerCase())) {
          found.set(clean.toLowerCase(), type);
        }
      };
      keep(nameNode?.text, n.type);

      // A GROUPING declaration names nothing itself and holds the names one level down: Go wraps
      // `type_spec`, `const_spec` and `var_spec`; C keeps fields in a `field_declaration_list`; an
      // enum keeps its members as children. Reading only the direct field left every one of those
      // as EXTRA — the pack was right and the checker was looking in the wrong place, which is the
      // same fault as the `childByFieldName` one above and was found the same way.
      if (!nameNode) {
        for (let i = 0; i < n.namedChildCount; i++) {
          const c = n.namedChild(i);
          keep(fieldOf(c, 'name')?.text, c.type);
          if (c.type === 'identifier' || c.type.endsWith('_identifier')) keep(c.text, c.type);
        }
      }
    }
    for (let i = 0; i < n.namedChildCount; i++) walk(n.namedChild(i));
  };
  walk(root);
  return found;
};

const B = path.join(ROOT, 'build/src/lib/core/parsing');
const { ConducksReflector } = await import(`${B}/reflector.js`);
const { AnalyzeContext } = await import(`${B}/context.js`);
const { grammars } = await import(`${B}/grammar-registry.js`);
const Parser = (await import(path.join(ROOT, 'node_modules/tree-sitter/index.js'))).default;

const reflector = new ConducksReflector();
const report = [];
let hardFail = false;

for (const pack of PACKS) {
  const types = nodeTypesFor(pack.pkg);
  if (!types) { report.push({ lang: pack.lang, skipped: 'no node-types.json in the grammar package' }); continue; }
  const declTypes = new Set([
    ...types.filter(t => t.named).map(t => t.type).filter(t => DECL_SUFFIX.some(s => t.endsWith(s))),
    ...(EXTRA_DECL_TYPES[pack.lang] ?? []),
  ].filter(t => !NOT_A_SYMBOL.has(t)));

  const filePath = path.join(FIXTURES, pack.file);
  const source = readFileSync(filePath, 'utf8');

  await grammars.loadLanguage(pack.lang);
  if (grammars.isLanguageUnavailable(pack.lang)) {
    report.push({ lang: pack.lang, skipped: 'grammar failed to load' });
    continue;
  }

  const parser = new Parser();
  parser.setLanguage(grammars.getLanguage(pack.lang));
  const declared = declaredNames(parser.parse(source).rootNode, declTypes);

  const mod = await import(`${B}/languages/${pack.lang}/index.js`);
  const provider = new mod[pack.provider]();
  const spectrum = await reflector.reflect({ path: filePath, source }, provider, new AnalyzeContext(), [filePath]);

  // The UNIT node is minted for the file itself and names no declaration; it is not a finding.
  const minted = new Set(spectrum.nodes
    .filter(n => String(n.canonicalKind) !== 'UNIT')
    .map(n => String(n.name).toLowerCase())
    .filter(n => /^[a-z_$][\w$]*$/.test(n)));

  const missed = [...declared.keys()].filter(n => !minted.has(n));
  const extra = [...minted].filter(n => !declared.has(n));

  report.push({
    lang: pack.lang, declared: declared.size, minted: minted.size,
    missed, extra,
    missedTypes: [...new Set(missed.map(n => declared.get(n)))].sort(),
  });
}

// ── Heritage: a pack that captures inheritance must emit an edge for it ───────
//
// The fixture per language is deliberately two lines and unambiguous. A pack that cannot resolve
// THIS has nothing subtle wrong with it.
const HERITAGE = [
  ['typescript', 'TypeScriptProvider', '/h/a.ts',    'class Base {}\nclass Child extends Base {}\n'],
  ['tsx',        'TSXProvider',        '/h/a.tsx',   'class Base {}\nclass Child extends Base {}\n'],
  ['javascript', 'JavaScriptProvider', '/h/a.js',    'class Base {}\nclass Child extends Base {}\n'],
  ['python',     'PythonProvider',     '/h/a.py',    'class Base:\n    pass\nclass Child(Base):\n    pass\n'],
  ['java',       'JavaProvider',       '/h/A.java',  'class Base {}\nclass Child extends Base {}\n'],
  ['go',         'GoProvider',         '/h/a.go',    'package p\ntype Base struct{}\ntype Child struct{ Base }\n'],
  ['ruby',       'RubyProvider',       '/h/a.rb',    'class Base\nend\nclass Child < Base\nend\n'],
  ['rust',       'RustProvider',       '/h/a.rs',    'struct Child;\ntrait Base {}\nimpl Base for Child {}\n'],
  ['php',        'PHPProvider',        '/h/a.php',   '<?php\nclass Base {}\nclass Child extends Base {}\n'],
  ['swift',      'SwiftProvider',      '/h/A.swift', 'class Base {}\nclass Child: Base {}\n'],
];

const heritageMissing = [];
for (const [lang, providerName, file, source] of HERITAGE) {
  const qPath = path.join(ROOT, `src/lib/core/parsing/languages/${lang}/queries.ts`);
  if (!existsSync(qPath)) continue;
  // Only score a pack that CLAIMS to capture heritage. One that does not is a gap of a different
  // kind, and reporting it here would blame the pack for a language feature nobody wired.
  if (!/@heritage/.test(readFileSync(qPath, 'utf8'))) continue;

  await grammars.loadLanguage(lang);
  if (grammars.isLanguageUnavailable(lang)) continue;
  const mod = await import(`${B}/languages/${lang}/index.js`);
  const spectrum = await reflector.reflect({ path: file, source }, new mod[providerName](), new AnalyzeContext(), [file]);
  const edges = (spectrum.relationships ?? [])
    .filter(e => e.type === 'EXTENDS' || e.type === 'IMPLEMENTS' || e.type === 'INHERITS');
  if (!edges.length) heritageMissing.push(lang);
}

// ── Report ────────────────────────────────────────────────────────────────────
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const next = {};

console.log('\n--- 🔮 Conducks — language pack oracle -------------------------------------');
console.log('    the grammar walked exhaustively, against what the pack captured\n');

for (const r of report) {
  if (r.skipped) { console.log(`  ${r.lang.padEnd(7)} SKIPPED — ${r.skipped}`); continue; }
  const prev = base[r.lang]?.missed;
  next[r.lang] = { missed: r.missed.length };

  const prevExtra = base[r.lang]?.extra;
  next[r.lang] = { missed: r.missed.length, extra: r.extra.length };

  const ratchet = prev === undefined ? 'new'
    : r.missed.length > prev ? `REGRESSED (${prev} -> ${r.missed.length})`
    : r.missed.length < prev ? `improved (${prev} -> ${r.missed.length})` : 'held';
  if (prev !== undefined && r.missed.length > prev) hardFail = true;
  if (prevExtra !== undefined && r.extra.length > prevExtra) hardFail = true;

  console.log(`  ${r.lang.padEnd(7)} grammar declares ${String(r.declared).padStart(2)} · pack minted ${String(r.minted).padStart(2)}`
            + ` · MISSED ${String(r.missed.length).padStart(2)} (${ratchet}) · EXTRA ${r.extra.length}`);
  if (r.missed.length) console.log(`          missed: ${r.missed.join(', ')}`);
  if (r.missed.length) console.log(`          types:  ${r.missedTypes.join(', ')}`);
  if (r.extra.length)  console.log(`          EXTRA:  ${r.extra.join(', ')}`);
}

console.log(`\n  heritage · ${HERITAGE.length} packs claim an inheritance capture · `
  + (heritageMissing.length ? `${heritageMissing.length} PRODUCE NO EDGE: ${heritageMissing.join(', ')}`
                            : 'every one produces an edge'));
if (heritageMissing.length) hardFail = true;

if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
  console.log('\n  baseline written.');
} else if (hardFail) {
  console.log('\n  ✖ a pack lost a symbol it used to capture, or invented one it did not.\n');
  process.exit(1);
} else {
  console.log('\n  ✓ no pack regressed against its baseline.\n');
}
