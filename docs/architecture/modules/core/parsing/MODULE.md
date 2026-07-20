# core/parsing — grammars, language plugins, and the capture processors

**Layer:** core. Imports contracts only. The largest module in the codebase (~66 files), almost all
of it per-language surface area.

**Responsibility:** turning source text into a language-agnostic spectrum. It owns the tree-sitter
grammar lifecycle, one query (`.scm`) per language, the small processors that turn a capture into a
relationship (import, call, heritage, binding, flow), and the canonical taxonomy that maps a
language's own node kinds onto conducks' 9.

**Boundaries:** it produces a spectrum, never a graph. It does not resolve cross-file references —
that is the orchestrator's later pass — and it does not decide what a finding means.

**Deferred / not built:** type-position captures exist only for TypeScript, TSX and Go. Python,
Rust, Java and C# are type-blind, so any analysis keyed on type usage silently yields nothing for
them. That is a known limit, not a bug, and it is why `isTypeOnly` never fires outside TS/TSX.

## The query is the most dangerous file in the module

A tree-sitter query compiles all-or-nothing. **One unrecognized node type fails the entire query**
and drops the language to the Gnosis (regex, file-only) fallback — silently. Counts fall; nothing
errors. This has happened at least four times: Go `method_spec` → `method_elem`, Rust
`constrained_type_parameter` removed in 0.24, TSX `jsx_attribute`, and grammar renames at 0.25.

So: never hand-verify a pattern against grammar docs. Compile each candidate against the real
installed grammar first, from a script **inside the repo** (one in `/tmp` cannot resolve
`tree-sitter` from node_modules). After the edit, run a clean `analyze` and check the node count
held steady — a collapse means the fallback engaged.

## Captures only fire where a node exists

A standalone query pattern that carries no `@isX` definition capture builds no node, and any handler
gated on that node never runs. This is why the graph has **zero EXTENDS/IMPLEMENTS edges** despite
inheritance being captured correctly and both types being in the `EdgeType` union — the heritage
patterns are standalone, so `heritage.process()` has never been called (todo11). When adding a
capture, check whether its handler needs an enclosing node, and pattern it accordingly.

## Case is load-bearing at this boundary

Downstream IDs are lowercased for APFS, which collapses TypeScript's type and value namespaces
(`nodeId` vs `NodeId`). Processors therefore preserve the original spelling in `metadata.original`.
A new processor that emits a name-bearing relationship must do the same or it will silently break
type/value classification.

## Grammars and workers

Grammar loading is native, not WASM, so ABI must match the tree-sitter runtime — a mismatch produces
a NULL root and a silent degrade, not an error. Worker threads do not inherit the parent's loaded
grammar; each worker loads its own, cached per worker.
