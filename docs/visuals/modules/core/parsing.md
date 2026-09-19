# core/parsing — source text → spectrum

**Layer:** core — it may import contracts and core siblings, and it does. **The one violation this
note used to describe is GONE** (ADR 0093): `pulse-worker.ts` imported the reflector from domain, and
the fix was not the dependency inversion that had been debated for weeks — the reflector imported
NOTHING from domain, so it was a core module filed in the wrong folder. It now lives here, and the
layer gate grants zero exceptions.

The largest module in the codebase (67 files), 50 of them per-language surface area.

**Responsibility:** turning source text into a language-agnostic *spectrum* — the intermediate form
everything above consumes. Nothing upstream of this module knows what language a file was written in.

**Boundaries:** it produces a spectrum, never a graph, and it works one file at a time. Cross-file
resolution belongs to the [orchestrator](../domain/analysis/orchestrator.md); judgement
belongs to [governance](../domain/governance.md). Every language provider declares
`readonly extensions: string[]`, `readonly langId`, `readonly queryScm` and `readonly importSemantics`
(<span class="anchor">src/lib/core/parsing/providers/base.ts:10</span>) — there is no `reflect()`
method on the provider interface; `resolveImport`, `isBoundaryModule`, `calculateComplexity`,
`extractDebt`, `normalizeHeritage`, `isBuiltIn`, `getVisibility` and `extractDocs` are optional.

**Uses:** reads `core/git`'s chronicle for a file's commit history and blame data, and hands the
per-author commit distribution to `core/algorithms`' `calculateShannonEntropy` /
`normalizeEntropyRisk` to score each file's ownership risk while building its spectrum
(<span class="anchor">src/lib/core/parsing/reflector.ts:1582-1587</span>). It reads `contracts` for
the taxonomy and built-ins. It hands the finished spectrum to the orchestrator, which does the
cross-file work this module refuses to do.

**Deferred / not built:** language parity. Support is deliberately uneven — TypeScript and TSX are
first-class, Go and Python close behind, the rest have definitions and calls but shallower semantics.
Breadth was chosen over uniform depth; see the per-part docs for what that costs.

## Parts

- **[languages/](parsing/languages.md)** — one tree-sitter query per language. Where language support
  actually lives, and the most dangerous files to edit.
- **[processors/](parsing/processors.md)** — capture → relationship. Import resolution, calls,
  heritage, bindings, flow.
- **[grammar-registry/](parsing/grammar-registry.md)** — native grammar loading, parsers, ABI.
- **[taxonomy/](parsing/taxonomy.md)** — the canonical 9 kinds and ranks.

Unlisted files are small and self-describing: `context` (per-pulse symbol registry and local
bindings), `ignore-manager` (`.conducksignore`), `pipeline` and `pulse-worker` (batching and worker
entry), `essence-lens` (package manifests), `language-plugin` and `providers/base` (the provider
interface), `prism-core` (the abstract prism + spectrum types), `match-facts` (the reflector's pure
half — a node or a match in, a plain value out), `build-layout` (where a source file lands, read from
the project's own build config — ADR 0153), `doc-comments`, `capture-tags` and `next-routes`.

`built-ins` (per-language globals) is NOT here: it lives in
<span class="anchor">src/contracts/built-ins.ts</span>, because both parsing and the graph read it.
Listed as a parsing file until 2026-08-17.

**A seam that WAS duplicated, resolved.** `parsing/prism-core.ts` once had a byte-identical twin
under persistence — two copies of the same `ConducksPrism` base re-exporting `contracts/prism-types.ts`.
The persistence copy is deleted; the parsing copy is the only one. If a second prism base ever
appears under another module, that is the same accident returning — the spectrum type belongs to
parsing.

## The one theme across every part

**Failures here are silent, not loud.** A bad query pattern, a mismatched grammar ABI, an
undersized parse buffer, a capture with no enclosing node — none of them throw. They degrade: fewer
nodes or missing edges while the command still exits 0. Four distinct features have shipped keyed off
data this module never produced. (Whole-language drops to a regex fallback WERE part of this list
until ADR 0089 deleted that fallback; a language that cannot be read is now a reported ParseFailure.
The quieter degrades above are the ones that remain.)

So the verification habit is fixed: after any change here, run a clean `analyze` and compare node
and edge counts against the previous run. Counts holding steady is the signal that nothing silently
fell back.

## One thing here is not a query, and cannot be

`next-routes.ts` derives a route from a FILE PATH and a list of exported names. It holds no parser
and touches no grammar, which looks out of place in a module whose whole job is queries — and that is
exactly the point. Every other route pattern matches the EXPRESS shape, a call expression naming its
own path, so a query can capture it. Next.js declares a route by WHERE THE FILE SITS
(a Next.js app/api/plans/[id]/route.ts), and there is no expression to match. Measured on a real subject
before it existed: 118 route files, zero route nodes.

The derivation is where the interesting mistakes are, so it is pure functions over a path and a list
of names: `[id]` becomes `:id`, `[...slug]` becomes `:slug*`, a `(group)` directory is removed
entirely, and the scan anchors at the LAST `app/` so a repo with two apps resolves each against its
own root. Method detection is case-sensitive because Next.js only treats an uppercase export as a
handler.

Anything else declared by convention rather than by an expression belongs here on the same terms.

## Features
- [languages](parsing/languages.md) — per-language tree-sitter queries
- [processors](parsing/processors.md) — capture to relationship
- [grammar-registry](parsing/grammar-registry.md) — native grammar loading
- [taxonomy](parsing/taxonomy.md) — the canonical kind vocabulary
- [reflector](parsing/reflector.md) — the match loop that builds a file's spectrum

## Glossary
- **spectrum** — the language-agnostic intermediate form parsing produces: nodes with canonical
  kinds and ranges, plus relationships. Nothing above this module knows what language a file was
  written in.
- **`properties.isTest`** — set per file by the reflector at parse time
  (`src/lib/core/parsing/reflector.ts:293,660,1278`) and does NOT survive the vault: the persisted
  `metadata` column carries no such key, so it is `undefined` on every graph loaded from the vault —
  which is every graph a read command sees. `src/contracts/test-path.ts:42` treats it only as "the
  parse-time flag, when the graph is still in memory" and falls back to a path-based check
  (`isTestPath`) for the persisted case. A filter written against the flag alone is a silent no-op
  once the pulse ends.
- **ParseFailure** — what a missing parser, an unparseable file or an empty-compiling query throws
  since ADR 0089. There is no silent degrade below this: a language that cannot be read is a reported
  failure, not fewer nodes.

## Traps
- **One parseable-extension list, not four.** The list of extensions worth parsing used to exist
  three times verbatim across separate consumers, and a fourth was about to be added. It now lives
  once in `contracts/source-extensions.ts`; a language missing from one copy used to be invisible to
  that one consumer, which then reported "nothing changed" rather than "not looked at".
- **A worker parses in its OWN process — main-thread state it is not explicitly sent does not
  exist there.** Every file is parsed in a subprocess that builds a fresh context from an
  EXPLICITLY-PASSED subset of state (`context.ts`'s `exportState()`/`mergeState()`, consumed by
  `pulse-worker` and `worker-pool`). Registering something on the main thread and not adding it to
  that exported/merged set means the feature is live exactly where no parsing happens — the ADR 0108
  workspace fix produced byte-identical numbers before and after its first attempt on a real subject
  for exactly this reason. Any new resolver input needs adding in all of: context state, the worker
  pool's run signature, the fork's JSON payload, and the in-process fallback path. Verify by
  re-running on a real subject and checking the number actually MOVED — "the code looks right" cannot
  see a process boundary.
