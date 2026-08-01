# core/parsing/languages — one tree-sitter query per language

**Part of:** [core/parsing](../MODULE.md). 50 files across 13 language folders. Each folder owns a
`queries.ts` (the tree-sitter query, an S-expression string — there are **no `.scm` files**; the
query language is scm, the container is TypeScript), an `index.ts` provider, and usually a
`resolver.ts` / `extractor.ts` / `bindings.ts`.

**Responsibility:** declaring what a language's syntax means in conducks' vocabulary — which node is
a definition, a call, an import, a type position. This is where language support actually lives; the
reflector is generic over it.

**Boundaries:** a query declares captures and nothing else. Any logic about what a capture *implies*
belongs in [processors](../processors/MODULE.md).

**Deferred / not built:** type-position captures exist only for TypeScript, TSX and Go
(`@pulse_type_target`). Python, Rust, Java and C# are type-blind, so `isTypeOnly` never fires for
them and any type-driven analysis silently yields nothing. Adding them is per-language work tracked
in todo10.

## The all-or-nothing trap — read before editing any `queries.ts`

A tree-sitter query compiles as a unit. **One unrecognized node type fails the whole query**, and the
language silently drops to the Gnosis regex fallback: file-level nodes only, no edges, no error. The
symptom is a quiet drop in counts, and every symbol in that language starts looking orphaned.

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
the enclosing node never runs. This is why the graph has **zero EXTENDS/IMPLEMENTS edges** — still
true today; a vault edge census shows no heritage edge of either type. The heritage patterns are
syntactically correct and hit when probed, but every one of them is standalone
(`typescript/queries.ts:30-32`, `python/queries.ts:22-23`, and the same shape in go, rust, java,
javascript), while the handler is gated on an enclosing node: `else if (cName === 'heritage' && node)`
(`analysis/reflector.ts:438`). Ruby is the only language whose heritage pattern carries a definition
capture (`@isHeritage`), and so the only one that could reach the handler at all. Fix tracked in
todo11. **Pattern a capture together with
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
