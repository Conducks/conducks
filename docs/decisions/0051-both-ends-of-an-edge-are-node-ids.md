# 0051 — both ends of an edge are node ids, or the edge is not written
Status: Accepted
- Enforced by: tests/integration/features/pulse-writes-every-table.test.ts (no `PULSES_TO` edge has a source that is absent from `nodes`)
- Date: 2026-07-30

## Context

`bindPulseCircuits` records a variable handover: a value produced in one place and passed to a call
somewhere else. Its target was the consuming call's target — a real node id. Its SOURCE was
`producer.targetId`, which is the ACCESSES edge's target, which is the variable name: `value`.

A variable name is not a node id. Nothing in `nodes` is keyed by it, so 199 of these edges pointed
FROM something the graph did not contain, on a vault where every other dangling problem had been
closed. `audit` reported nothing, because its orphan check reads `targetId` and never `sourceId` —
the same shape as every other finding this session: a check that looks at one side of a two-sided
property.

The edge was also semantically wrong, not merely mis-keyed. "This variable pulses to `consume`" says
less than "`produce`'s output feeds `consume`". The variable is the vehicle; the producing function
is the fact worth recording.

## Decision

**An edge is written only when both endpoints resolve to node ids, and a handover's source is the
PRODUCING CALL's target.**

The assignment edge already carries its right-hand side in `properties.value`. Matching that against
the calls in the same scope recovers the call that produced the value, and its `targetId` is a real
node. On the reference fixture the edge went from `value -> …::consume` to
`…flow.ts::produce -> …flow.ts::consume`, and dangling sources went to zero.

**When the producer cannot be recovered, no edge is written.** A handover whose producing call is
unknown is a guess, and ADR 0046 priced guesses so they could be filtered — but an edge from a
NON-EXISTENT node cannot be filtered by confidence, because every consumer that walks it must handle
the missing endpoint first. A missing edge is a gap; a dangling edge is a lie with a shape.

**Not chosen: materialising the variable as a node.** It would make the endpoint resolvable and it
would put thousands of local variables in a graph whose taxonomy deliberately cuts them (ADR 0013's
ATOM gate). The graph is about symbols that outlive a scope.

**Not chosen: keeping the edge and lowering its confidence.** Confidence expresses "how far to trust
this relationship", not "one end of this does not exist". Overloading it would make
`WHERE confidence > 0.6` mean two different things, which is the exact conflation ADR 0046 removed
from the column.

**The binders' edges are persisted after every resolver has run, not inside `resonate()`.** This was
not in the first version of this decision and the measurement forced it: pointing the source at the
producing call took dangling sources from 199 to 41, and the remaining 41 were an ORDERING problem.
`bindPulseCircuits` runs inside `resonate()`, while `IntraLinker` (which rebinds bare call targets)
and virtual induction (which materialises external ones) both run after it — so an edge written at
bind time captured an id that was about to be resolved. Persisting after both, and dropping what
still has no endpoint, took it to zero.

**Not chosen: fixing `audit` to check sources instead.** It should check both, and it will — but that
would have made 199 bad edges VISIBLE rather than absent. The edges were the defect.

## Consequences

Fewer `PULSES_TO` edges — 352 before, 287 after on this repository, of which 41 were dropped at
persist time with the count reported rather than silently. A handover whose producer is not a call in the same scope — a parameter, a
destructured field, a value from an outer closure — is no longer recorded at all, where it previously
produced an edge from a name. The count on this repository will drop and that is the fix working, not
a regression, but it must not be read as "handover detection got worse".

`audit`'s orphan check still reads targets only, so the class of defect this record fixes remains
invisible to it for any OTHER edge type. That is now the only known place it can hide, and it is
worth closing on its own rather than as a footnote here.

`Open:` whether the same rule should be enforced at the persistence boundary rather than per binder.
`saveEdges` could refuse any edge whose endpoints are not present, which would make this decision
structural instead of a convention each binder has to remember — and would have caught it years
earlier. It would also reject the legitimately-dangling external references that virtual induction
materialises AFTER the edges are written, so the ordering would have to change first. Not costed.
Carried by todo25#P7.
