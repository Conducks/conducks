# core/parsing/languages — one tree-sitter query per language

**Part of:** [core/parsing](../MODULE.md). ~50 files, one folder per language, each owning an `.scm`
query and a small provider.

**Responsibility:** declaring what a language's syntax means in conducks' vocabulary — which node is
a definition, a call, an import, a type position. This is where language support actually lives; the
reflector is generic over it.

**Boundaries:** a query declares captures and nothing else. Any logic about what a capture *implies*
belongs in [processors](../processors/MODULE.md).

**Deferred / not built:** type-position captures exist only for TypeScript, TSX and Go
(`@pulse_type_target`). Python, Rust, Java and C# are type-blind, so `isTypeOnly` never fires for
them and any type-driven analysis silently yields nothing. Adding them is per-language work tracked
in todo10.

## The all-or-nothing trap — read before editing any .scm

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
the enclosing node never runs. This is why the graph has **zero EXTENDS/IMPLEMENTS edges**: the
heritage patterns are syntactically correct and hit when probed, but they are standalone, so
`heritage.process()` has never been called (todo11). Pattern a capture together with the definition
it belongs to when its handler needs one.
