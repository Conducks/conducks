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
resolution belongs to the [orchestrator](../../domain/analysis/orchestrator/MODULE.md); judgement
belongs to [governance](../../domain/governance/MODULE.md).

**Deferred / not built:** language parity. Support is deliberately uneven — TypeScript and TSX are
first-class, Go and Python close behind, the rest have definitions and calls but shallower semantics.
Breadth was chosen over uniform depth; see the per-part docs for what that costs.

## Parts

- **[languages/](languages/MODULE.md)** — one tree-sitter query per language. Where language support
  actually lives, and the most dangerous files to edit.
- **[processors/](processors/MODULE.md)** — capture → relationship. Import resolution, calls,
  heritage, bindings, flow.
- **[grammar-registry/](grammar-registry/MODULE.md)** — native grammar loading, parsers, ABI.
- **[taxonomy/](taxonomy/MODULE.md)** — the canonical 9 kinds and ranks.

Unlisted files are small and self-describing: `context` (per-pulse symbol registry and local
bindings), `ignore-manager` (`.conducksignore`), `pipeline` and `pulse-worker` (batching and worker
entry), `built-ins` (per-language globals), `essence-lens` (package manifests), `language-plugin` and
`providers/base` (the provider interface), `prism-core` (the abstract prism + spectrum types).

**One seam here is duplicated and should not be.** `parsing/prism-core.ts` and
`persistence/prism-core.ts` are byte-identical — two copies of the same `ConducksPrism` base and the
same re-exports of `@/types/prism-types.js` — and both are live: `graph-engine.ts` imports
`PrismSpectrum` from the parsing copy and `PrismRequest` from the persistence copy (lines 2 and 5),
while `reflector.ts` takes both from the persistence copy. The spectrum type belongs to parsing;
persistence owning a parser base class is an accident of history, not a boundary anyone chose. Consult
this before importing either path — pick parsing, and expect the other to be collapsed.

## The one theme across every part

**Failures here are silent, not loud.** A bad query pattern, a mismatched grammar ABI, an
undersized parse buffer, a capture with no enclosing node — none of them throw. They degrade: fewer
nodes, missing edges, or a whole language dropping to the regex fallback while the command still
exits 0. Four distinct features have shipped keyed off data this module never produced.

So the verification habit is fixed: after any change here, run a clean `analyze` and compare node
and edge counts against the previous run. Counts holding steady is the signal that nothing silently
fell back.

## One thing here is not a query, and cannot be

`next-routes.ts` derives a route from a FILE PATH and a list of exported names. It holds no parser
and touches no grammar, which looks out of place in a module whose whole job is queries — and that is
exactly the point. Every other route pattern matches the EXPRESS shape, a call expression naming its
own path, so a query can capture it. Next.js declares a route by WHERE THE FILE SITS
(`app/api/plans/[id]/route.ts`), and there is no expression to match. Measured on a real subject
before it existed: 118 route files, zero route nodes.

The derivation is where the interesting mistakes are, so it is pure functions over a path and a list
of names: `[id]` becomes `:id`, `[...slug]` becomes `:slug*`, a `(group)` directory is removed
entirely, and the scan anchors at the LAST `app/` so a repo with two apps resolves each against its
own root. Method detection is case-sensitive because Next.js only treats an uppercase export as a
handler.

Anything else declared by convention rather than by an expression belongs here on the same terms.
