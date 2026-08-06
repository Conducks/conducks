# 0094 — a property chain over an object literal is read, not refused
Status: Accepted
- Date: 2026-08-02
- Builds: 0084, 0090, 0092
- Enforced by: the oracle fixture T30/T31/T32 (a property chain, a chain through a getter, and the container's own properties not reported dead) — expected answers committed before the first run
- Amended by: todo35 — the dangling rates quoted here were measured BEFORE the guess sweep split deletes from keeps; they compare like with like and stand as relative improvements, but the honest absolute rate after the sweep is 7.35% on conducks (todo35 Phase 1), not the ~1% basis these figures imply

## Context

`core/graph/linkers/MODULE.md` recorded dynamic dispatch as deliberately unhandled and used
`registry.evolution.watcher` as its example, beside `handlers[key]()`. **Only one of those is
dynamic.** A computed key names no symbol at parse time and must be refused. A property chain over an
object literal has no computed hop at all — every name is written in the source.

The two were filed together, and the label kept the second unexamined for weeks. It is the same
shape as ADR 0093: a true statement about something else, promoted to a reason.

Measured before building: six of conducks' seventeen remaining orphan findings were registry
properties reached this way — the entire remaining false-positive population after ADR 0092 — and the
call edges dangled as well.

## Decision

**Record which identifier each property PATH of an object literal aliases, and walk it.**

The scoping note listed four pieces: mint nodes for nested properties, link identifier-valued
properties, link getters, then walk. Measuring first collapsed it to one capture, one column and one
linker rule — because **the call processor already preserved the entire path**
(`container.ts::container.services.registry.lookup`). Nothing was lost at parse time; the chain was
simply never walked. So no nodes are minted, and `pruneTaxonomy` is untouched.

Three things are refused, each because recording them would be a guess:
a COMPUTED key (`[key]: fn`), a value that is a call or expression, and a getter whose body is
anything but a single `return <identifier>`.

The last two still record their PATH with an EMPTY value. `get watcher() { return evolution.getWatcher(...); }`
computes its value, so no type can be read — but the property is demonstrably wired. **Wired and
type-unstated are different facts and are stored as different values:** dead-code reads the path and
treats the name as reachable; the resolver refuses it.

## Consequences

- MEASURED on conducks: orphans **17 → 13**, dangling **1.273% → 1.148%**, source-verified member
  calls **1,205 → 1,227 and still 100%**. On mentorseed: edges **20,518 → 21,193**, dangling
  **0.556% → 0.505%**, source-verified **1,314 → 1,365 and still 100%**.
- **More edges resolved AND every one still correct** is the strongest evidence available that a rule
  is real rather than fitted to the fixture that motivated it.
- All six registry false positives are gone. The one finding left in that file,
  `initializeRegistry`, was checked against source and is TRUE — nothing imports it.
- The longest matching path wins, because `services` and `services.registry` may both be recorded and
  only the longer names a value. Every hop is uniqueness-gated, and an ambiguous hop refuses the whole
  chain — a partially-resolved chain landing somewhere plausible is the wrong-edge failure ADR 0085
  measured.
- Nesting is bounded at six levels. Deeper than that a literal is data, not wiring.
- **The backtick trap fired a seventh time**, in all three query files at once, and the pre-build
  check named every one before the compiler ran (ADR 0089). That gate has now paid for itself twice.
