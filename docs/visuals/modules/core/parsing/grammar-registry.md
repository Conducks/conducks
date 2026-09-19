# core/parsing/grammar-registry — native grammar loading

**Part of:** [core/parsing](../parsing.md). One file, disproportionate blast radius:
every language depends on it and its failures are silent.

**Layer:** core.

**Responsibility:** loading a tree-sitter grammar, holding one parser per language, and compiling
queries. It is the only place that knows grammars are native modules rather than WASM, and the only
place that touches the `tree-sitter` package at runtime.

**Boundaries:** it loads and hands back a parser. It knows nothing about captures or conducks'
taxonomy. Grammars are loaded explicitly, once per worker — each worker calls `loadLanguage(langId)`
for the language it is about to parse rather than inheriting a cache from the parent process
(<span class="anchor">src/lib/core/parsing/pulse-worker.ts:132</span>).

**Uses:** takes nothing from elsewhere in core; it is a leaf that only touches the `tree-sitter`
native binding and the grammar packages. [languages](languages.md) and
[reflector](reflector.md) take a compiled parser from it.

**Deferred / not built:** no per-grammar version pinning or capability probing. A grammar either
loads or the language is marked unavailable.

## The binding is OPTIONAL, so it may only be reached lazily

`tree-sitter` and the 12 grammar packages are `optionalDependencies` (ADR 0027): the core package
ships no prebuilds, so it compiles at install time and is simply ABSENT on a machine with no C++
toolchain. Every runtime use goes through `loadNative()` — a cached `require` inside a `try/catch` —
and `isNativeAvailable()` answers whether the path is live. **With no binding, `analyze` now refuses
outright rather than degrading** — ADR 0089 deleted the regex fallback entirely, so a missing binding
is the whole parse path failing, not a lower-fidelity one. This note used to say the reflector's
"Gnosis" regex extractor carried the analysis when the binding is absent; that stopped being true at
ADR 0089 and the sentence outlived it, the same way `doctor` once promised "Analysis still works, at
lower fidelity" on a platform where the very next `analyze` refused (measured on alpine/musl,
`doctor.ts:39-47`). The loader's log line still says "fall back to Gnosis"
(<span class="anchor">src/lib/core/parsing/grammar-registry.ts:51</span>) — that message is itself
stale prose in a code comment, not a live behaviour.

**Never value-import `tree-sitter` anywhere.** ESM resolves static imports before the first line of a
module runs, so a `try/catch` inside the module cannot protect it: an absent optional dep kills the
CLI at load with `ERR_MODULE_NOT_FOUND`, before any fallback exists to run. `import type` is fine — it
erases. This held by accident for a long time (`Parser` happened to appear only in type positions in
12 files) and is now pinned by `tests/unit/core/parsing/optional-native-binding.test.ts`.

There is no WASM path and no `resources/grammars/` directory. A 20 MB set of `.wasm` files lived there
long after anything stopped loading them; ADR 0027 removed them.

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

## Node 23+ needs C++20 to build the bindings

`npm install` fails with `C++20 or later required` on Node 23, 24 and 25. Those versions' V8 headers
require C++20 while tree-sitter's `binding.gyp` still defaults to C++17. Build with
`CXXFLAGS="-std=c++20" npm install`.

**Do NOT set `CFLAGS` to the same value** — it breaks the C compile of `lib.c`. Node LTS 20 and 22
build without the flag, which is why this only appears to some people and reads as a broken machine
rather than a version constraint.

## Features
- none — one registry, no user-facing sub-capability

## Glossary
- **native binding** — the compiled `tree-sitter` module and its per-language grammar packages,
  `optionalDependencies` that may simply be absent on a machine with no C++ toolchain.
- **Gnosis** — the name of the regex fallback ADR 0089 deleted. It survives only as a name in a log
  message and as the term for when the native binding itself will not load — never as a working
  parse path.

## Traps
- **The regex ("Gnosis") parsing fallback is gone — do not re-add it.** ADR 0089 deleted it entirely;
  it was formerly known as the "Regex Parsing Fallback" capability (once described in the
  now-dissolved `features.md`, ADR 0193). There is no degraded-but-working path left for a missing or
  unloadable native binding — see the next trap.
- **A missing binding does not degrade, it refuses.** Since ADR 0089, `analyze` checks
  `isNativeAvailable()` once and refuses up front rather than falling back per file. A stale comment
  or a stale doctor message claiming "lower fidelity" is describing a capability that no longer
  exists — see the corrected paragraph above.
- **An ABI mismatch does not throw, it produces a NULL root and silently degrades to file-only
  nodes.** Go once had the runtime pinned to an older `tree-sitter` while `tree-sitter-go` emitted a
  newer ABI. When adding or bumping a grammar, verify a real parse produces symbols — not just that
  the import resolved.
