# core/parsing/languages — one tree-sitter query per language

**Part of:** [core/parsing](../parsing.md). 50 files across 13 language folders. Each
folder owns a `queries.ts` (the tree-sitter query, an S-expression string — there are **no `.scm`
files**; the query language is scm, the container is TypeScript), an `index.ts` provider, and usually
a `resolver.ts` / `extractor.ts` / `bindings.ts`.

**Layer:** core.

**Responsibility:** declaring what a language's syntax means in conducks' vocabulary — which node is
a definition, a call, an import, a type position. This is where language support actually lives; the
reflector is generic over it.

**Boundaries:** a query declares captures and nothing else. Any logic about what a capture *implies*
belongs in [processors](processors.md).

**Uses:** takes the compiled parser handed back by
[grammar-registry](grammar-registry.md) and nothing else — a query has no runtime dependency of its
own, it is a pattern the registry compiles and the reflector runs.

**Deferred / not built:** type-position captures exist only for TypeScript, TSX and Go
(`@pulse_type_target`). Python, Rust, Java and C# are type-blind, so `isTypeOnly` never fires for
them and any type-driven analysis silently yields nothing. Adding them is per-language work tracked
in todo10.

## The all-or-nothing trap — read before editing any `queries.ts`

A tree-sitter query compiles as a unit. **One unrecognized node type fails the whole query**, and
every file in that language is then unreadable. Since ADR 0089 that is a reported `ParseFailure`
rather than a silent drop to the regex fallback — but the counts still fall, and the older habit of
reading a drop as "that language has fewer symbols" is the one to unlearn.

It has happened at least four times — Go `method_spec` → `method_elem`, Rust
`constrained_type_parameter` removed in 0.24, TSX `jsx_attribute`, and assorted 0.25 renames. Grammar
node names are **not** stable across grammar versions.

The procedure, every time:

1. Compile each candidate pattern against the **installed** grammar in a throwaway script. Run it
   from inside the repo — a script in `/tmp` cannot resolve `tree-sitter` from node_modules.
2. Add the pattern.
3. Clean `analyze`, then confirm the node count held. A collapse means the fallback engaged.

Never verify a pattern against grammar documentation or memory. Compile it.

## A capture only fires where its handler can reach a node

A standalone pattern — one with no `@isX` definition capture — builds no node, so a handler gated on
the enclosing node never runs. That is what produced **zero EXTENDS/IMPLEMENTS edges** for a long
time: the heritage patterns were syntactically correct and hit when probed, but every one of them
was standalone, while the handler is gated on an enclosing node — `&& node`, now on a three-way
capture test that also takes `heritage_extends`/`heritage_implements`
(<span class="anchor">src/lib/core/parsing/reflector.ts:795</span>).

**FIXED, and the fix is now scored.** Every heritage pattern co-captures a definition node — see
<span class="anchor">src/lib/core/parsing/languages/python/queries.scm:39</span>, where `@heritage`
sits inside a pattern ending `@isStruct`, and the note at
<span class="anchor">src/lib/core/parsing/languages/typescript/queries.scm:158</span> that records
why the standalone form was abandoned. `tools/benchmark/oracle-packs.mjs` fails the build if any pack
that CLAIMS a heritage capture stops producing an edge for a two-line fixture that plainly has one;
all ten produce one today. Three packs — ruby, rust and php — were found emitting none on 2026-08-17
by exactly that check, with every gate otherwise green.

The paragraph above said "still true today; a vault edge census shows no heritage edge of either
type" for some time after it had stopped being true. Nothing catches that: `visuals-lint` proves an
anchor resolves, never that the sentence around it is honest. **Pattern a capture together with
the definition it belongs to when its handler needs one.**

## Signature capture, and the one rule behind it

Every language captures `@params` on its parameter-list node and, where the language declares one,
`@return_type`. The shared helper in `reflector.ts` does the rest — a language is added by writing
those two captures and nothing else (ADR 0086, ADR 0087).

The name is NOT read from a field. Eleven grammars disagree about which field holds it — `pattern`,
`name`, `declarator`, or nothing at all — so the annotation is carved out of the parameter's own span
instead and whatever remains is the name. That keeps `*args`, `&blk`, `k:`, `&$c` and `...$rest`
intact, which a field lookup silently dropped.

Both gaps this note used to state are CLOSED (ADR 0088). Swift's parameters are captured through a
second form, `@params_inline`, which tags the FUNCTION and filters its children by node type —
tree-sitter-swift has no parameter-list node to tag. Generators have their own pattern in all three
JS-family files; before that a starred function produced no node at all, which was a missing function
rather than a missing signature.

What remains: a single unparenthesised arrow parameter (`const f = a => a`) has no parameter node in
the grammar at all, in either JavaScript or TypeScript, so it cannot be captured under either form.

## Features
- one query set per language: C, C++, C#, Go, Java, JavaScript, PHP, Python, Ruby, Rust, Swift,
  TypeScript, TSX — each captures the constructs that carry that language's own structure rather
  than a shared lowest common denominator (Go's goroutines as spawner-to-spawned edges, Rust's trait
  impls as IMPLEMENTS, Ruby's `attr_accessor`/`define_method` as its own shape)

## Glossary
- **query** — the tree-sitter S-expression that declares which nodes a language's grammar produces
  are a definition, a call, an import or a type position. Declares captures only; what a capture
  *implies* is a processor's job.
- **provider** — the per-language `index.ts` implementing `ConducksProvider`: the query plus the
  optional resolution hooks (`resolveImport`, `isBoundaryModule`, …).

## Traps
- **A query that compiles is not a query that matches.** PHP calls a double-quoted literal
  `encapsed_string`, not `string`; a PHP `variable_name`'s text INCLUDES the leading `$`, so an
  anchored predicate that escapes it matches nothing while the unanchored form works. Neither a
  compile nor a typecheck catches this — probe the AST before writing the pattern.
- **A `#match?` predicate over an unbound optional capture fails, it is not vacuously true.**
  `(modifiers (visibility_modifier) @cap (#match? @cap "..."))?` silently drops every declaration
  with NO modifier — the optional group leaves `@cap` unbound and the predicate rejects the whole
  match instead of passing. The fix is an anonymous-token alternation inside the optional group so
  the capture only binds for the listed keywords.
- **The same capture name means different things in different grammars.** A blanket
  `(scoped_type_identifier) @pulse_type_target` is correct for Rust (one path segment, one capture)
  and wrong for Java, whose grammar nests `java.util.Optional` as containing `java.util` as a child
  `scoped_type_identifier` — the same blanket pattern there fires twice per dotted type. Copying a
  working pattern from one language to another is not safe without checking whether the grammar
  nests the node.
- **Type positions have no common shape across grammars.** Python wraps every annotation in a
  uniform `(type …)` node; C#'s `type` is a hidden supertype with no concrete node, so `type:`/
  `returns:` fields point straight at `identifier`/`generic_name`; Rust and Java need field anchors
  because a bare `(type_identifier)` also matches the struct or class's own declaration name. A
  query that matches nothing does not error — it silently yields zero forever.
- **A `(string)` capture includes its quotes.** `'/users'` captured from a route path is not equal to
  `'/users'` captured the same way elsewhere unless both are stripped first.
- **A backtick inside a query file's comment terminates the template literal.** `queries.ts` holds
  the SCM query in a JS template literal; `tsc` then reports `';' expected` on the FOLLOWING line,
  pointing at the pattern rather than the comment that broke it. Write those comments in words, never
  with a code fragment in backticks.
- **Swift reuses one grammar field id for two different things.** `return_type` and the function's
  own `name` alias onto the same field id in tree-sitter-swift 0.7.1, so `return_type: (user_type)`
  compiles and matches nothing; the working form writes `name:` twice in one pattern, disambiguated by
  node type.
- **A verb captured as dotted text will not match `^get$`.** Python's route pattern matched
  `@infra_method` against `^(get|post|...)$`, but Flask's `@app.get('/x')` gave the capture the text
  `app.get`, which never matched — the pattern only worked for a bare `@get('/x')`, which nobody
  writes. Fixed by capturing the ATTRIBUTE node directly
  (<span class="anchor">src/lib/core/parsing/languages/python/queries.scm:83</span>), whose text is
  the bare verb. Any language where a verb can appear as a method on an object needs its capture
  checked against a real framework snippet, not just against the predicate.
- **A tree-sitter query naming two fields must use the GRAMMAR's field order, not alphabetical.**
  `(method_declaration name: (identifier) @name type: (_) @return_type)` COMPILES and then throws
  `TSQueryErrorStructure` when a match is created; swapping to `type: ... name: ...` — the order the
  grammar declares — works
  (<span class="anchor">src/lib/core/parsing/languages/java/queries.scm:17</span>,
  <span class="anchor">src/lib/core/parsing/languages/csharp/queries.scm:25</span>). The error surfaces
  at MATCH time, not compile time, so it reads as a caller bug rather than a malformed query, and
  a grammar's node-types manifest lists fields alphabetically — copying the order from there is the natural thing to
  do and is wrong. Probe with a real `query.matches()` call, never compile-success alone.
- **Only NAMED imports had a per-binding capture, so a default import bound nothing.**
  `import SessionsPage from './SessionsPage'` reaching `export default function OrgSessionsPage`
  produced no link: the per-binding capture matched `named_imports` only
  (<span class="anchor">src/lib/core/parsing/languages/typescript/queries.scm:6</span>), so the local
  name was never registered and the exported declaration was left with no incoming edge — reported
  ORPHAN. This is the ordinary React/Next shape of a route importing the component beside it. The two
  halves join through `default`: the import binds its local to that name, the exporting file records
  which symbol it is, and alias-chain resolution does the rest — no linker change needed once both
  facts existed.
- **A dynamic import is an import whatever surrounds it — anchor on the CALL, not on what wraps it.**
  The only dynamic form once captured was `const { X } = await import('...')`, anchored on the
  `variable_declarator`. The shape that matters in real code awaits nothing and destructures nothing —
  `React.lazy(() => import('./PluginView'))`
  (<span class="anchor">src/lib/core/parsing/languages/ecmascript-positions.ts:46</span>) — so a file
  importing many plugin components this way had every one reported UNIMPORTED_MODULE. Capturing the
  file alone made it WORSE (the module became reachable, so its own symbols were then judged unused);
  the fix also needed the unbound form to CONSUME the target's `default`, matching `React.lazy`'s real
  contract. Half of this fix is worse than none: capture the call, and bind what it actually consumes.
- **A test that uses the EASIER form of a shape proves nothing about the form real code uses.** An
  `export const fmt = (n) => ...` and the unexported `const fmt = ...` match the same
  `variable_declarator`, but where a language keeps a dedicated `export_statement`-wrapped pattern
  alongside the plain one (<span class="anchor">src/lib/core/parsing/languages/typescript/queries.scm:297</span>
  next to the plain form at line 123), only one of the two races to create the node and may carry
  fewer captures. Real code exports; a unit test covering only the unexported shape can pass while the
  exported shape silently loses signature captures. Grep for `export_statement` in a language's
  queries file and check both forms record the same thing.
