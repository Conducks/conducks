# core/parsing/grammar-registry — native grammar loading

**Part of:** [core/parsing](../MODULE.md). One file, disproportionate blast radius: every language
depends on it and its failures are silent.

**Responsibility:** loading a tree-sitter grammar, holding one parser per language, and compiling
queries. It is the only place that knows grammars are native modules rather than WASM.

**Boundaries:** it loads and hands back a parser. It knows nothing about captures or conducks'
taxonomy.

**Deferred / not built:** no per-grammar version pinning or capability probing. A grammar either
loads or the language is marked unavailable.

## Native, not WASM — so ABI compatibility is a real constraint

Grammars load as native bindings, so a grammar only works if its ABI matches the tree-sitter runtime.
A mismatch does not throw — it produces a NULL root, and the language silently degrades to file-only
nodes. Go once did exactly this: the runtime was pinned to `tree-sitter@0.21.x` while
`tree-sitter-go@0.25` emitted a newer ABI. Fixed by moving the runtime to 0.25.

**When adding or bumping a grammar, verify a real parse produces symbols** — not just that the import
resolved.

## The 0.25 wrapper needs the full language object

`setLanguage()` must receive the complete `{language, nodeTypeInfo}` object, not the raw `.language`
pointer. The 0.25 JS wrapper unmarshals nodes via `tree.language.nodeSubclasses`, derived from
`nodeTypeInfo`; passing the bare pointer crashes with *"Cannot read properties of undefined (reading
'166')"* on first node access. There is a micro-parse sanity check after `setLanguage` for this
reason — keep it.

## Workers do not inherit grammars

A worker thread does not receive the parent's loaded grammar, even when the parent has already loaded
it. Each worker must load its own; the cache is per worker, not per process. Parallel parsing that
assumes otherwise silently parses nothing.

## Parse buffer size

tree-sitter's Node binding defaults to a 32KB parse buffer and throws on larger input. The reflector
sizes the buffer to the source for big files — without it, every file over 32KB fell back to Gnosis
and its symbols looked orphaned. That was one of five stacked bugs behind a historical 8024-orphan
report.
