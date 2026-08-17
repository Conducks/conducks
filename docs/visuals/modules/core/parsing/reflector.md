# core/parsing/reflector — file → spectrum

**Part of:** [core/parsing](../parsing.md) — moved out of domain/analysis by ADR 0093. One file, `parsing/reflector.ts`, and the
single most load-bearing unit in the codebase: every language, every file, every pulse goes through
its match loop.

**Responsibility:** walking a file's query matches and building its spectrum — nodes with canonical
kinds and ranges, relationships, scope resolution, per-binding import records, and the type-only
classification that decides whether an import survives compilation.

**Boundaries:** one file at a time. It never resolves cross-file references and never touches the
graph or the vault. Anything needing repo-wide knowledge belongs to the
[orchestrator](../../domain/analysis/orchestrator.md).

**Deferred / not built:** the split. This should be a dispatcher over per-capture handlers (import,
call, definition, reference-as-value) and is instead one giant `for (const capture of match.captures)`
chain. It is wanted, not done, and it is the main reason edits here are risky.

Two pieces HAVE come out, and neither is the dispatch: the pure functions moved to
<span class="anchor">src/lib/core/parsing/match-facts.ts</span> (a node or a match in, a plain value
out, nothing touching the spectrum), and the four capture pairs that each held their own
`pending… = null` became one `PendingPair`. The chain itself stays, and the measurement that explains
why is worth keeping: moving it needs **29 of `reflect()`'s locals** threaded out, 19 of them shared
mutable state. That converts implicit coupling into an explicit bag rather than reducing it, in the
file where a defect reaches all 42 commands.

## Treat every change as systemic

There is no seam isolating one language or one capture kind from another, and the file carries ~33
`as any`. A local-looking change can alter every language's output. Two habits:

- Verify with a **clean pulse**, not a unit test alone. `analyze` is incremental, so a re-run on an
  unchanged repo can show no difference while the logic is broken.
- Watch node counts. A silent drop means a query failed and that language went unread — since ADR 0089
  there is no regex fallback, so what follows a broken query is a reported `ParseFailure` and a graph
  missing every symbol in that language.

**A relationship's endpoint name must produce the id the node writer stores.** The two are decided in
different places — `saveNodes` scopes a binding to its enclosing function (`<file>::main2.doit`) while
a processor handed a bare name yields `<file>::doit` — and a mismatch does not error, does not read as
a broken link, and DELETES the node: `pruneTaxonomy` counts a node referenced only when an edge's
endpoint IS that node. `scopePrefix` in the definition branch is the shape to match (todo62,
CONDUCKS-28).

## Type-only classification (ADR 0016)

`markTypeOnlyImports` runs as a post-pass once the spectrum is complete, because usage evidence is
only known after the whole file is walked. The rule is deliberately asymmetric:

- **type-only** requires *positive* type evidence and no value use. Absence of evidence means
  "value" — over-counting coupling is visible, hiding a real cycle is not.
- `EXTENDS` counts as a value use (a base class is a runtime binding); `IMPLEMENTS` and
  `TYPE_REFERENCE` are type uses.
- Matching is **case-sensitive**, using the original spellings processors preserve. Lowercased IDs
  collapse `nodeId` onto `NodeId`, and matching on the folded name marked the imported type as
  value-used — a false ARCH-3 cycle that survived two ADRs.
- A file-level import edge is type-only only if **every** binding it carries is. A side-effect import
  (an import './x.js' side-effect form) carries no bindings and is always a real edge.

The same computation inverted does *not* give you unused-import detection: "no evidence" would then
mean *unused*, the aggressive direction. That is why STALE_IMPORT is a separate, still-unshipped
problem (todo11).

## A binding capture is not always spelled `@name`

Per-binding `IMPORTS` relationships — the ones function-level dead code and type-only marking both
read — are emitted only for captures the binding loop recognises. It accepted `@name` alone, and
Python's import query spells the same thing `@named_import`, so **Python produced no per-binding
import edges at all** until 2026-08-07 (ADR 0143's change). The cost was invisible because nothing
downstream errors on their absence; it just answers less. When adding a language, check that its
`isImport` pattern's binding capture is one this loop accepts, and assert an edge rather than
assuming one.

Type-only marking is INFERRED from use (a binding referenced only in type positions), never from a
keyword — so it works for any language whose type positions are captured, and a missing type-position
pattern reads as "this import is a value use". Python's forward reference is the case that bites:
`o: "Order"` is a STRING, which is exactly what a name imported under `if TYPE_CHECKING:` requires,
so the imports the feature most needs to see were the ones no query captured.

## There is no fallback here — it FAILS

This section used to describe a Gnosis regex extractor the reflector fell back to when a grammar was
unavailable or a parse failed. **That has not been true since ADR 0089**, and the paragraph directly
contradicted the one further up this same page, which already said so. Both were on the page at once
for weeks; nothing reads prose, so nothing noticed.

What actually happens: a missing parser, a grammar that cannot parse the file, or a query that
compiles to nothing each `throw new ParseFailure` carrying file, language and reason
(<span class="anchor">src/lib/core/parsing/reflector.ts:194</span>). The orchestrator reports those
and says plainly that the symbols and edges are MISSING — the whole point of ADR 0089 being that a
degraded answer is indistinguishable from a real one.

`Gnosis` survives as a name in <span class="anchor">src/lib/core/parsing/grammar-registry.ts:51</span>
for the case where the NATIVE BINDING itself will not load, which is a different failure from a file
that will not parse.
