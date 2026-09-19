# core/parsing/reflector — file → spectrum

**Part of:** [core/parsing](../parsing.md) — moved out of domain/analysis by ADR 0093.
One file, `parsing/reflector.ts`, and the single most load-bearing unit in the codebase: every
language, every file, every pulse goes through its match loop.

**Layer:** core.

**Responsibility:** walking a file's query matches and building its spectrum — nodes with canonical
kinds and ranges, relationships, scope resolution, per-binding import records, and the type-only
classification that decides whether an import survives compilation.

**Boundaries:** one file at a time. It never resolves cross-file references and never touches the
graph or the vault. Anything needing repo-wide knowledge belongs to the
[orchestrator](../../domain/analysis/orchestrator.md).

**Uses:** takes a compiled query from [grammar-registry](grammar-registry.md), dispatches each raw
capture to a [processor](processors.md), and maps every node's grammar kind onto
[taxonomy](taxonomy.md)'s `canonicalKind`/`canonicalRank`. It also reads
[core/git](../../git.md)'s chronicle for a file's commit history and blame data, and feeds the
resulting author distribution to [core/algorithms](../../algorithms.md)'
`calculateShannonEntropy`/`normalizeEntropyRisk` to score the file's ownership risk
(<span class="anchor">src/lib/core/parsing/reflector.ts:1582-1587</span>).

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

**It is getting further away, not closer.** The deep-clean campaign recorded this file at 1,696 lines
while closing every other core feature; it is 1,738 today. No todo carries the split — it is wanted,
blocked on scope, and recorded here so the next person does not go looking for a plan that does not
exist.

## Treat every change as systemic

There is no seam isolating one language or one capture kind from another, and the file carries ~37
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
the producer's id shape — see [core/graph](../../core/graph.md)).

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

## Features
- none — the reflector is one file with one entry point, `reflect()`

## Glossary
- **match loop** — the single `for (const capture of match.captures)` chain that walks every query
  match for a file and builds its spectrum. Not yet split into per-capture handlers (see Deferred).
- **PendingPair** — the one shared shape now used by all four capture pairs that used to each hold
  their own `pending… = null` local.

## Traps
- **A relationship's endpoint name must produce the id the node writer stores, or the node gets
  silently deleted.** `saveNodes` scopes a binding to its enclosing function
  (`<file>::main2.doit`); a processor handing back a bare name yields `<file>::doit`. The mismatch
  does not error and does not read as a broken link — `pruneTaxonomy` counts a node referenced only
  when an edge's endpoint IS that node, so the wrongly-scoped edge causes the real node to be dropped
  as unreferenced. `scopePrefix` in the definition branch is the shape to match.
- **A scope-resolution bug corrupts the node ID itself, not just a parent pointer.** `getScopeAt`
  used to resolve a declaration's scope from row ranges alone, excluding only the declaration's own
  NAME. On `export class Widget { run(): void {} }`, the class and its one-line method share a start
  and end row, so while resolving `Widget` its own method `run` passed the row test and became its
  parent — id `::run.widget` instead of `::widget`. Multi-line code hid this completely. The scope map
  now carries `startCol`/`endCol` and `getScopeAt` refuses any scope CONTAINED by the declaration's
  own span; both the id and `parentId` needed the fix, not just `parentId`.
- **STALE_IMPORT under-reports by design.** `findStaleImports` reports a binding only on affirmative
  absence across every evidence class (calls, constructs, accesses, type references, extends/
  implements, dependency links, identifier-in-arguments). Namespace, side-effect, default and
  unresolved imports are structurally invisible to it — never "missed", because no per-binding edge
  exists for them to check. Recall changes need re-running the tsc-subset validation, not just adding
  another guard.
- **Type-only classification only works for languages with a type-position capture.** `isTypeOnly`
  needs a `@pulse_type_target` capture; only TypeScript, TSX and Go emit one. Every other language is
  type-blind, so a type-aware finding on those languages is not wrong, it is silent — it evaluates to
  nothing rather than failing.
- **A processor pushing straight onto `spectrum.nodes` used to lose the push.** The match loop ends
  with `spectrum.nodes = Array.from(nodeCache.values())`
  (<span class="anchor">src/lib/core/parsing/reflector.ts:1491</span>) — anything a processor had
  pushed onto `spectrum.nodes` earlier in the walk, bypassing `nodeCache`, was discarded by that
  assignment. Every route and request node `FlowProcessor` created was lost this way, in every
  language, for as long as the code existed. The line now reads
  `[...Array.from(nodeCache.values()), ...virtualNodes]`, merging in whatever `spectrum.nodes` holds
  that `nodeCache` does not. A processor inventing a node (routes, requests, virtual libraries) must
  still be verified to reach the VAULT, not just the spectrum — three of four historical cross-service
  breaks were invisible at the spectrum level alone.
- **`resonate()`'s edges are not persisted for free.** `bindNeuralCircuits`, `bindRouteCircuits` and
  `bindPulseCircuits` add edges to the in-memory graph inside `ConducksGraph.resonate()`
  (<span class="anchor">src/lib/core/graph/graph-engine.ts:139</span>), which the pulse calls AFTER
  the last wave flush. A pulse then ends with a metadata-only save, which writes no rows — any new
  binder added to `resonate()` inherits this and needs its edges explicitly saved. Assert the edge is
  in the vault after a pulse, not that the binder ran.
- **Route detection is centralised in the reflector, not the grammar.** All ten grammars capture
  `@kinesis_route_path`; the reflector triggers on that one capture and normalises the verb itself
  (`GetMapping` → GET, `HandleFunc` → GET) rather than branching per language. Query SEMANTICS cannot
  be shared (node types differ per grammar), but the meaning of a route is identical everywhere and
  belongs in one place. Adding a language means adding a capture pattern, never a branch in the
  reflector. The REQUEST half is still TypeScript-only (`@kinesis_request_url` exists nowhere else) —
  routes working in a language does not mean cross-service binding works there.
- **`nodes.fingerprint` cannot answer "did this file change" — it is per SYMBOL.** `fingerprint` is a
  SHA-256 of `path|name|dna` per symbol
  (<span class="anchor">src/lib/core/parsing/reflector.ts:610</span>), written for the drift engine.
  It looks like a file hash and is not one: a file with no symbols has none at all, and a
  comment-only edit changes no fingerprint while still needing a re-parse to move every line number
  below it. File-level freshness is a separate concern (a `file_hashes`-style table), never this
  column.
- **A local declaration can lose every reference to a built-in of the same name.** A reference is
  routed to `GLOBAL::name` the moment the name is in the built-in list
  (<span class="anchor">src/lib/core/parsing/reflector.ts:1495</span>), and that test can run before
  anything asks whether the file declares the name itself — so `interface Location` in a project's own
  code can be reported ORPHAN while being referenced twice in its own file, because both references
  routed to the DOM's `Location` instead. `Request`, `Response`, `Document` and `Navigator` are on the
  same built-in list, and a project declaring its own is ordinary. It is invisible by construction:
  identical code differing only in the NAME gets opposite verdicts, so renaming the symbol to
  reproduce it makes the bug disappear. Shadowing must be resolved AFTER the walk, from the set of
  names the file itself declares — deciding during the walk depends on file layout (was the
  declaration read before the use), not on the code.
- **A case-collision count is not a damage count.** `class UserRepository` beside `const
  userRepository` is an ordinary TypeScript idiom that collides on a lowercased node id — measured at
  12 of 658 files on one subject, 32 of 513 on another. It is almost always harmless: the VALUE wins
  the id (<span class="anchor">src/lib/core/parsing/reflector.ts:554-556</span>) — "edges target
  values and a value has a body to point at" — so the surviving node carries the class's real span.
  Re-casing the id itself was measured and rejected (todo32#P2): it changes ~38% of all ids, every
  fingerprint, every baseline and every stored layer. Counting collisions does not test whether span
  attribution is wrong; reading the surviving span back against source does. Do not re-open this on a
  raw count.
