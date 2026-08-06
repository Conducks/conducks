# todo48 — three correctly-scoped leftovers from the audit close
Status: todo
- Acceptance: each item below is either built with its measurement, or dropped with a reason — none may close by being forgotten, which is how they were nearly lost inside todo25's finished tasks.
- Builds: 0074, 0079

## Context

Closing todo25 surfaced three findings its own tasks marked as "worth a fresh task" or "carried by
no todo". A finding recorded only inside a closed task's prose is invisible to the board; this
record is the difference between deferred and forgotten.

## Phase 1 — the wave cap has no override

- [x] The 1,500-node wave cap (ADR 0079) truncates visibly and keeps the heaviest slice, but there
      is no flag to raise it — measured on mentorseed: 2,321 eligible of 6,002, about a third of
      eligible nodes unreachable through that surface. Add `--wave-cap <n>` (validated positive
      integer, error not silent default), or record why a fixed cap is the contract.
      → BUILT on both surfaces, because the dashboard is driven by HTTP and the CLI only starts it:
      `conducks mirror --wave-cap <n>` (invalid value EXITS 1 rather than defaulting silently — a
      caller who asked for 5,000, got 1,500 and was not told would read the truncation notice as
      the graph's real size) and `GET /api/synapse?limit=<n>` (a non-numeric or non-positive value
      is IGNORED rather than becoming 0, which would serve an empty wave that reads as an empty
      graph). Precedence pinned by test: request limit > gateway cap > the persistence default,
      which is now a NAMED `DEFAULT_WAVE_CAP` rather than an inline 1500 — a number that can be
      overridden should say so where it is declared.

## Phase 2 — NAMESPACE is mis-tagged in four grammars

- [x] C++/C#/PHP/Rust namespace-shaped declarations are tagged `@isPackage` instead of
      `@isNamespace`, so they land on PACKAGE — proven by this repo's own two PACKAGE rows, which
      are a C# and a PHP namespace fixture, not a deployable unit (ADR 0074's open question). Fix
      the four query files; a fixture namespace per language must produce a NAMESPACE node.
      → STALE CLAIM, and the claim is the finding. All four query files ALREADY carry
      `@isNamespace` (`cpp/queries.ts:16`, `csharp/queries.ts:39`, `php/queries.ts:39`,
      `rust/queries.ts:39`) and `mapToCanonical` routes `namespace` to NAMESPACE — the fix landed
      with ADR 0086's capture work and ADR 0074's open question was never re-run against it. RUN
      2026-08-06 on a purpose-built six-language fixture: C++ `geometry`, C# `Acme.Billing`, PHP
      `Acme\Shop` and Rust `parser` all land NAMESPACE with zero PACKAGE rows in those files,
      while Go `worker` and Java `com.acme.tool` stay PACKAGE. Pinned by
      `tests/integration/features/namespace-languages.test.ts` so the claim decays loudly next
      time. Trap found on the way: `semantic_kind` holds the RAW kind (lowercase `namespace`),
      `canonicalKind` holds the taxonomy kind — a query filtering `semantic_kind IN ('PACKAGE')`
      matches nothing and reads as a clean result.

## Phase 3 — type-only import detection is TS/TSX-only

- [x] `markTypeOnlyImports` needs a per-binding `@name` capture inside a language's `isImport`
      pattern; TS and TSX have it, the other ELEVEN languages do not (Go captures only `@source`),
      so they are type-blind and every type-only import survives compilation into the graph as a
      real edge. Decide which languages have type-only imports worth marking (Go does not; Python's
      `TYPE_CHECKING` does), and wire the capture where it pays.
      → SCOPED BY MEASUREMENT, then built for the one language that has the construct. "Eleven
      blind languages" was the wrong frame twice over: most of them (Go, Rust, C#, PHP, Ruby,
      Swift, C, C++) have no type-only import CONSTRUCT at all — an import there is a real link
      dependency and marking it would be a lie — and most DO already carry a binding capture. The
      real second case is Python's `if TYPE_CHECKING:`, which exists precisely so a name can be
      annotated without existing at runtime, and is the standard fix for a Python import cycle —
      exactly the finding an unmarked edge pollutes. Three defects fixed to make it work, each
      found by running rather than reading: (1) the binding loop accepted only `@name` and Python
      spells it `@named_import`, so Python produced NO per-binding IMPORTS edges at all — costing
      type marking AND function-level dead-code detection; (2) a forward reference is a STRING
      (`o: "Order"`), which is what a TYPE_CHECKING import forces, and no query captured it —
      `(type (string (string_content)))` added; (3) ADR 0143, the one that mattered: the resolver's
      stdlib REFUSAL was expressed as `undefined`, indistinguishable from ignorance, so
      `from typing import Optional` bound to the subject's own `human/typing.py` — 316 dangling
      edges into one file. MEASURED on the frozen Python subject: **679 per-binding import edges
      where there were zero**, 335 marked type-only (the `typing`/`Optional`/`Dict` family, which
      is exactly right), and dangling **12.58% → 8.15%** with the edge count GROWING.

## Phase 4 — layer storage is built but no pulse writes it

- [ ] Everything under todo20#P3 is built and mutation-checked (content-addressed node+edge layers, read-through load, reachability GC rules, `diffLayers`, `mergeImpact`) — and no pulse WRITES a layer yet, so it all runs only in tests. The activation tails, each named in its closed task: the per-pulse `collectableLayers()` call, a command surface for `mergeImpact` (whose `callersOf` today can only come from the working tree's graph), and the pulse writing layer rows at all. Activate together or drop together, with the measurement either way; the WIP branch that attempted this (`wip/todo20-layered-storage`) was dropped as unverified — start from the tested mechanisms, not from that diff.
