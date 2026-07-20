# core/parsing — source text → spectrum

**Layer:** core. Imports contracts only. The largest module in the codebase (~66 files), almost all
of it per-language surface area.

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
entry), `built-ins` (per-language globals), `essence-lens` (package manifests).

## The one theme across every part

**Failures here are silent, not loud.** A bad query pattern, a mismatched grammar ABI, an
undersized parse buffer, a capture with no enclosing node — none of them throw. They degrade: fewer
nodes, missing edges, or a whole language dropping to the regex fallback while the command still
exits 0. Four distinct features have shipped keyed off data this module never produced.

So the verification habit is fixed: after any change here, run a clean `analyze` and compare node
and edge counts against the previous run. Counts holding steady is the signal that nothing silently
fell back.
