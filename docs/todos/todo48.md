# todo48 — three correctly-scoped leftovers from the audit close
Status: todo
- Acceptance: each item below is either built with its measurement, or dropped with a reason — none may close by being forgotten, which is how they were nearly lost inside todo25's finished tasks.
- Builds: 0074, 0079

## Context

Closing todo25 surfaced three findings its own tasks marked as "worth a fresh task" or "carried by
no todo". A finding recorded only inside a closed task's prose is invisible to the board; this
record is the difference between deferred and forgotten.

## Phase 1 — the wave cap has no override

- [ ] The 1,500-node wave cap (ADR 0079) truncates visibly and keeps the heaviest slice, but there
      is no flag to raise it — measured on mentorseed: 2,321 eligible of 6,002, about a third of
      eligible nodes unreachable through that surface. Add `--wave-cap <n>` (validated positive
      integer, error not silent default), or record why a fixed cap is the contract.

## Phase 2 — NAMESPACE is mis-tagged in four grammars

- [ ] C++/C#/PHP/Rust namespace-shaped declarations are tagged `@isPackage` instead of
      `@isNamespace`, so they land on PACKAGE — proven by this repo's own two PACKAGE rows, which
      are a C# and a PHP namespace fixture, not a deployable unit (ADR 0074's open question). Fix
      the four query files; a fixture namespace per language must produce a NAMESPACE node.

## Phase 3 — type-only import detection is TS/TSX-only

- [ ] `markTypeOnlyImports` needs a per-binding `@name` capture inside a language's `isImport`
      pattern; TS and TSX have it, the other ELEVEN languages do not (Go captures only `@source`),
      so they are type-blind and every type-only import survives compilation into the graph as a
      real edge. Decide which languages have type-only imports worth marking (Go does not; Python's
      `TYPE_CHECKING` does), and wire the capture where it pays.

## Phase 4 — layer storage is built but no pulse writes it

- [ ] Everything under todo20#P3 is built and mutation-checked (content-addressed node+edge layers, read-through load, reachability GC rules, `diffLayers`, `mergeImpact`) — and no pulse WRITES a layer yet, so it all runs only in tests. The activation tails, each named in its closed task: the per-pulse `collectableLayers()` call, a command surface for `mergeImpact` (whose `callersOf` today can only come from the working tree's graph), and the pulse writing layer rows at all. Activate together or drop together, with the measurement either way; the WIP branch that attempted this (`wip/todo20-layered-storage`) was dropped as unverified — start from the tested mechanisms, not from that diff.
