# 0191 — a flow is keyed by its entry, and a cross-service call is recognised by its stamp
Status: Accepted
- Enforced by: tests/unit/domain/kinetic/flow-engine.test.ts (a local caller at either confidence the producer emits disqualifies an entry; a `tier: 'service'` caller does not; two entries sharing a name are two flows with two ids) — each mutation-checked, and the confidence rule restored turns three of them red
- Builds on: 0046, 0113
- Date: 2026-09-05

## Context

Phase 5 of todo77 scored `flows` and found two defects in one rule, both invisible from inside.

**The confidence exception swallowed the rule it was an exception to.** `groupProcesses` admitted an
entry when it had no incoming CALLS **or** when every incoming CALLS edge carried `confidence < 1`.
The comment states the intent plainly: an HTTP call between services is not a local caller, and the
handler on the far side is where execution begins for that service.

No CALLS edge is ever emitted at 1. MEASURED across the three benchmark subjects: scraper has 9,820
CALLS edges — 5,571 at 0.85 and 4,249 at 0.40, none at 1 — and sofie has 12,029 with exactly one.
ACCESSES *does* emit 1, 4,462 times on sofie, so the vault stores the value fine. CALLS simply never
receives it.

So the exception was always true and the "nothing calls it" half never ran. It admitted 1,327
genuinely-called symbols on scraper, 2,690 on sofie and 1,398 on orchestrator.

The confidences mean something else. 0.85 is a RESOLVED call and 0.40 an unresolved guess (ADR 0046),
and `adjacency-list.ts:578` promotes a guess back to 0.85 the moment it rebinds.
`http-service-linker.ts:99` stamps a genuine cross-service edge `tier: 'service'` and gives it 0.8 —
a value that appears in none of scraper's CALLS at all. The number identified nothing; the stamp was
there the whole time.

**And the result was keyed by the entry's bare NAME.** Two entries called `run` in different files
became one flow and the second silently overwrote the first: 2,842 of scraper's entry points (35%),
5,231 of sofie's (48%) and 2,854 of orchestrator's (44%) were discarded before any caller saw them,
and WHICH one survived depended on iteration order. The MCP surface then recovered the entry with
`findNodesByName(name)[0]`, so on any collision it could report a `file` belonging to a different
symbol than the flow was built from — a wrong answer rather than a missing one.

**Two unit tests asserted the broken rule and passed.** One built an edge at confidence 0.5 to mean
"cross-service" and one at 1 to mean "local", and the real producer emits neither for a CALLS edge.
That is ADR 0028's trap in a second place: a fixture built by the same person, in the same sitting,
from the same misunderstanding as the code will confirm the misunderstanding. 0028 recorded it about
node ids; it is the same failure about edge confidence.

## Decision

**A cross-service call is recognised by `properties.tier === 'service'`**, the stamp the HTTP linker
writes, and never by confidence. The intent of the rule is unchanged and now actually runs.

**A flow is keyed by its entry's ID.** `groupProcesses` returns `FlowProcess[]` — `{id, name,
members}` — instead of `Record<name, members>`. `name` stays, as the label a reader recognises; it is
no longer required to be unique because it never was. Both surfaces carry the `id`, and the MCP tool
fetches the entry node BY that id rather than by name.

**Not chosen: treating 0.4 as the cross-service marker.** It is ADR 0046's unresolved-target value,
it is promoted to 0.85 on rebind, and it appears on ordinary local calls the linker could not place.
Reading it as "another service" would swap one wrong proxy for another.

**Not chosen: keeping the name key and de-duplicating with a suffix.** A synthesised `run (2)` is not
addressable by anything downstream, and the id already exists and is already unique.

**Not chosen: fixing this inside Phase 5's scoring pass without a record.** It changes what a flow IS,
so every flow count on every subject moves — which is exactly the kind of change that needs a written
reason a later reader can find.

## Consequences

Flow counts drop and are now honest. Scraper 1,703 → 1,174, sofie 1,212 → 481, orchestrator 667 →
388, with entry points falling 8,170 → 6,843, 10,789 → 8,099 and 6,538 → 5,140. Both movements are
real: fewer symbols are wrongly admitted as entries, and the flows that a name collision used to
absorb now stand on their own and mostly fall below the two-member floor rather than inflating
another flow's closure.

Anyone comparing flow counts across this date is comparing two different questions, not a regression.

`--json` and the MCP response gain an `id` per flow. Nothing that already read `name`, `symbols`,
`project_members` or the counts changes shape.

`Open:` whether `--min-members` should default to something other than 2 now that the closures are
smaller. The floor was chosen when a flow could absorb every same-named entry's reach, and 481 flows
on sofie is a different distribution from 1,212. No todo carries this yet; the measurement that
settles it is a reader saying the list is too long or too short, which nobody has said.
