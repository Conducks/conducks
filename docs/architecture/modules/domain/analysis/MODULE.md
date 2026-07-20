# domain/analysis — the reflector, the orchestrator, and the query surface

**Layer:** domain. Imports core + contracts.

**Responsibility:** driving a pulse. The reflector walks a file's query matches and builds its
spectrum; the orchestrator sequences the multi-pass analysis (discovery → induction → cross-file
resolution) and owns everything that can only be decided once *all* files are known; the query
service answers structural questions over the finished graph.

**Boundaries:** it decides what is *true* about the code, never what is *acceptable* — no thresholds,
no violations. Governance owns judgement.

**Deferred / not built:** the reflector is a single ~750-line match loop with no internal seams, and
every language flows through it. Splitting it into per-capture handlers is wanted and not done;
until then, treat every edit as systemic and verify with a clean pulse rather than a unit test alone.

## Why analyze is multi-pass

A single pass cannot resolve a cross-file reference, because the target may not be parsed yet.
Discovery registers symbols; induction reflects each file; a final pass resolves imports and binds
bare names. This is also why the orchestrator, not the reflector, builds IMPORTS edges — the
reflector only seeds a raw specifier for later resolution.

The consequence that bites: **`analyze` is incremental — unchanged files are skipped entirely.**
Edges produced by an analysis pass do not regenerate for a file that has not changed, so after
editing a linker, orchestrator or query, a re-run may show no change at all. Verify any graph-shape
work with `conducks clean` + a fresh `analyze`, or you will debug against stale results. A partially
fixed state produces numbers that look real and are not.

## Type-only classification lives here

`markTypeOnlyImports` decides whether an import survives compilation (ADR 0016). It marks a binding
type-only only on **positive** type evidence plus no value use, and defaults to "value" whenever
evidence is missing — over-counting coupling is visible, hiding a real cycle is not. It matches
case-sensitively via the original spellings that parsing preserves, because lowercased IDs collapse
`nodeId` onto `NodeId`.

Note the asymmetry with unused-import detection: "no evidence" must mean *value* for type-only
classification but would mean *unused* for a stale-import finding — the aggressive direction. That
is why STALE_IMPORT is not simply the same computation inverted, and why it is still unshipped
(todo11).

## Docs grammar

`docs-grammar.ts` is here because the docs standard is a structural question about the repo. It
classifies each governed doc and lints it; architecture docs (this folder) are AUTHORED and
free-form, never linted (ADR 0015).
