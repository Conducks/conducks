# 0159 — an arm reads the base, it does not re-decide it
Status: Accepted
- Date: 2026-08-24
- Builds: 0148, 0158
- Enforced by: tests/architecture/no-logic-after-registry.test.ts ("no command or tool holds a numeric threshold of its own" — run against the unfixed tree first, where it named all three violations and nothing else)

## Context

conducks is an octopus, not a layered monolith: `analyze` builds the graph, `registry` composes, and
every other command is a consumer. Said stated the rule that follows from it — **all logic sits
before the registry; nothing after it decides anything** — and asked whether the code keeps it.

Measured across all 35 commands and 13 tools. It very nearly does. Every domain door is reached only
by `registry/index.ts`; the one interface that reaches a domain directly (`mirror-server.ts` →
`domain/analysis`) is drawn in `architecture.md`. Twelve of the 35 commands — the docs and federation
groups — never touch the graph at all, which is why a change to the resolver could not reach them.

**Four numeric thresholds lived after the registry. One was colour selection. Three were decisions.**

```
drift.ts:49    .filter(d => d.velocity < -0.01)     the improving list
drift.ts:138   .filter(d => d.velocity < -0.01)     the same, duplicated
status.ts:141  s.nodeCount > 50 && s.density < 0.5  the partial-graph verdict
```

Both were live defects, and neither was found by reading the code — they were found by taking the
architectural rule seriously and grepping for what it forbids.

**`drift`.** `drift-engine.ts` counted `improvement_count` as every `velocity < 0`; the command
listed only `< -0.01`. So sofie printed `Improving: 393` with no improving section beneath it — a
count whose evidence the same command declined to show. Round 5 recorded the symptom and read it as
one bug; it is two, and fixing the decay side one commit earlier made the improving half look
deliberate, because the block above it had started agreeing with itself.

**`status`.** The partial-graph check — a vault whose nodes were persisted and whose edges were lost
loads, reports READY, and answers everything from a fraction of the graph — existed only in the CLI.
`conducks_status` computed nothing of the kind. A person was warned and an agent reading the identical
numbers was not, which is the mirror rule ADR 0148 states and its enforcing test does not reach,
because the two surfaces genuinely share a registry accessor and diverge *after* it.

## Decision

**A threshold is a fact about the metric and belongs where the metric is defined.** Both move into
`contracts`, which every layer may import:

- `IMPROVEMENT_VELOCITY_THRESHOLD = -DECAY_VELOCITY_THRESHOLD`, read by `drift-engine.ts` for the
  count and by `drift.ts` for the list, so the two cannot disagree again.
- `PARTIAL_GRAPH_MIN_NODES` / `PARTIAL_GRAPH_MAX_DENSITY`, behind `graphHealth()`, called by the CLI
  and now by `conducks_status`.

**The rule is a gate.** `no-logic-after-registry.test.ts` fails on any float comparison in
`interfaces/cli/commands` or `interfaces/tools/tools`, with a named exception list — currently one
entry, `drift`'s colour selection, which decides nothing because the row is already in the list by
the time it runs. A grant that stops matching also fails, so an exception cannot outlive its reason.

**Symmetric, and that is a real behaviour change.** The improvement floor is now 0.05 rather than the
0.01 the render used. Checked against the data before choosing: of sofie's 393 sub-zero symbols,
**every one sat inside (-0.01, 0)** — so on real code the listing threshold changed nothing and the
count was the entire defect. The value is symmetric because a noise floor is a property of the
metric, not of the direction, and `-0.01` was a magic number in the interface, which is the thing
this record removes. `drift-improving.test.ts` encoded that magic number in its fixture and was
updated, with the reasoning written into it.

**Rejected: align the count to the interface's `-0.01` instead.** It would fix the symptom with less
churn, and it would keep a threshold that nothing declared. The decay side was aligned the other way
one commit earlier — to `DECAY_VELOCITY_THRESHOLD`, the only floor ever named as a constant — and two
directions of one metric answering to two different authorities is how this started.

**Rejected: leave `status`'s check in the CLI and copy it into the tool.** That is two homes for one
verdict, which is the defect one layer up.

**Not decided here: `calculateCompositeRisk`.** It is reached by `explain`, `impact`, `diff` and
`conducks_explain`, so tuning the risk model for one moves the other three — genuinely shared POLICY
rather than shared FACT, and the only instance of it on the surface. Whether those four want one risk
model or two is a product call, not a refactor.

## Consequences

- `Improving: 393` on sofie became `Improving: 0`, which is the honest number: those symbols were
  PageRank redistributing after a node was added, and no code improved.
- An agent now receives the same `health` verdict from `conducks_status` that a person sees.
- The gate is cheap and specific: it found exactly three violations and no false ones, and it would
  have caught the `drift` defect before round 5 ever ran.
- Everything shared between arms is now a FACT — the graph, node ids, edge types, the `contracts`
  vocabulary — with the single exception recorded above.

Open: `status.ts`'s judgement is now shared, but the *shape* of what each surface returns is still
authored twice, and nothing compares them. `graphHealth` is one field; the rest of the status payload
could drift the same way and no test would say so. No todo carries this.
