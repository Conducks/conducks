# 0027 — Native grammars are the only parse path, and they are an optional dependency

Status: Accepted
- Enforced by: `tests/unit/core/parsing/optional-native-binding.test.ts`
- Date: 2026-07-26
- Promoted: docs/memory.md (the dead WASM plumbing, and why a value import of an optional dep is a
  latent crash); README install section; `conducks doctor` now names the live parse path

## Context
Conducks is meant to be installed once and used by every project, but installing it meant cloning the
repo and hand-editing an absolute path into an MCP config. The blocker was assumed to be the
dependency chain: 13 `tree-sitter-*` packages in `dependencies`, a 20 MB `src/resources/grammars/`
directory of `.wasm` files, and a documented `CXXFLAGS="-std=c++20"` requirement with a
`npm run bootstrap` script existing only to work around it. The working theory was that WASM was the
runtime path and the native packages were the redundant half.

Tracing every consumer showed the opposite, and it changes what there is to fix.

**Nothing loads a `.wasm` file.** `web-tree-sitter` is not a dependency and never was installed. Five
call sites computed a path to the grammar directory; four of them (`src/registry/index.ts`,
`registry-bootstrapper.ts`, `graph-engine.ts`, `orchestrator.ts`) passed it into worker payloads that
never read it — `pulse-worker.ts:27` destructured `resourceDir` and used it nowhere. The fifth was an
`existsSync` check on `tree-sitter-python.wasm` in `conducks-core.pulse()` that threw if the file was
missing: a 20 MB directory shipped to satisfy a guard on a file nothing opened. `ConducksWatcher.init()`
called `Parser.init()` behind a `typeof === 'function'` test — the static WASM initialiser, which is
`undefined` on the native binding, so the whole block had always been a no-op.

**The install problem is narrower than assumed, and in a different place.** The 12 grammar packages
ship prebuilds for 6 platforms (darwin/linux/win32 × arm64/x64) — they need no compiler. The core
`tree-sitter` package ships NO prebuilds at any published version (0.25.0 is latest as of
2026-07-26), so `node-gyp-build` falls through to compiling from source. That single package is the
entire toolchain requirement, and it cannot be removed by repackaging.

That leaves a real choice, because the fast path and the portable path are not the same path. A WASM
port would need no compiler anywhere, but it is a rewrite of `grammar-registry` and the reflector
query paths, and the native engine was adopted specifically to escape the V8 WASM compile bottleneck
— the header comment in `grammar-registry.ts` says so.

## Decision
**Native is the only parse path. It is an optional dependency, and its absence degrades instead of failing.**

- All 13 packages (`tree-sitter` plus 12 grammars) moved from `dependencies` to
  `optionalDependencies`. `npm i -g conducks` now succeeds on a machine with no C++ toolchain: npm
  skips what it cannot build instead of aborting the install.
- `src/resources/grammars/` deleted, along with the four unread path values, the worker payload keys
  that carried them, the `existsSync` throw, and the two `cp *.wasm` steps in the build script.
- Every runtime use of the binding goes through `GrammarRegistry.loadNative()`, a lazy cached
  `require` inside a `try/catch`. `import type Parser` replaces the value import in all 13 files that
  had one.
- With no binding, `loadLanguage()` marks every language unavailable and the existing Gnosis regex
  extractor carries the analysis. `grammars.isNativeAvailable()` reports which path is live, and
  `conducks doctor` prints it.

**Rejected: a WASM port.** It buys a compiler-free install on every platform, which the graceful
degrade already approximates, at the cost of a rewrite and slower pulses — paying with the property
the native engine was chosen for, to fix a case the fallback already covers.

**Rejected: keeping the toolchain a hard requirement.** Honest, but it fails what this work was for:
an install that works on a clean machine.

**The rule this sets:** a dependency that may be absent may never be reached by a static import. ESM
resolves imports before the first line of a module runs, so a `try/catch` inside the module cannot
protect it — an absent optional dep kills the process at load, before any fallback exists to run.
Only `import type` (erased at compile) or a lazy `require` inside a function is safe.

## Consequences
The tarball drops from 22.9 MB unpacked to 1.6 MB (411 kB packed), and 686 files. A full pulse over
conducks itself still produces 1404 nodes and 3592 edges — the WASM directory was carrying nothing.

Fidelity is now environment-dependent, which is a real cost and has to be visible rather than
inferred. Measured on a two-file TypeScript + Python fixture: native gives 26 nodes / 27 edges, the
Gnosis fallback 25 / 32. Close on that fixture, but Gnosis is regex — it will diverge further on
code that needs a real parse, and it produces DIFFERENT edges, not merely fewer. `doctor` names the
live path and, when native is missing, prints the per-platform toolchain command.

The compile-away that made the old value imports harmless was luck, not design: `Parser` happened to
appear only in type positions in all 12 files, so `tsc` erased the imports. One `new Parser()` in any
of them would have turned a graceful degrade into `ERR_MODULE_NOT_FOUND` at CLI startup — on a
machine that by definition cannot run the test suite that would have caught it. Hence the guard test,
which fails on any value import of a `tree-sitter*` package and on any `.wasm` reference in `src/`.

`npm run bootstrap` and the `CXXFLAGS` documentation still exist and now describe an optional
convenience rather than a prerequisite; the README says so.
