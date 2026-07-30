# 0052 — a contract is carried only where something consumes it
Status: Accepted
- Resolved by: 0053
- Enforced by: tests/unit/domain/governance/sentinel-scope.test.ts (the sentinel still reports a class that genuinely fails a heritage rule, so removing the domain-wide rule did not disable heritage checking)
- Date: 2026-07-30

## Context

`ConducksComponent` requires `id` and `type`, where `type` is one of
`'parser' | 'analyzer' | 'resolver' | 'tool'`. Twenty-nine classes implemented it and a sentinel rule
required every `STRUCTURE` under `src/lib/domain/` to do so, reporting fourteen violations.

Tracing every consumer showed the contract had two real users and twenty-seven decorative ones:

| consumer | what it actually holds |
|---|---|
| `ToolRegistry extends ConducksRegistry<Tool>` | MCP tools, registered and fetched by id |
| `conducks-core.ts:64` → `getComponent('blast-radius-analyzer')` | exactly ONE domain class |
| `SynapseRegistry.registerProvider(pattern, provider: any)` | language providers — the parameter is `any`, the contract is not required |

No other domain service was registered, and none was looked up by id. Twenty-seven classes declared
an `id` and a `type` that nothing read.

The cost was measurable in conducks' own graph, which is the part that matters for a tool whose
product is structural understanding. Of 84 `IMPLEMENTS` edges in this repository, **31 pointed at
this marker** — 37% of the strongest signal the tool has about type relationships carried no
information about behaviour. A marker-implements and a real-implements are structurally identical,
so the noise is indistinguishable from the signal by any query.

Conforming the remaining fourteen would have pushed that toward 45%, and would have required writing
`type: 'analyzer'` on a thread pool, a gateway and a project registry — none of which is a parser, an
analyzer, a resolver or a tool.

## Decision

**A contract is carried only where something consumes it.** `ConducksComponent` stays in
`contracts/`, and stays on the two things that use it:

- `Tool extends ConducksComponent` — tools are registered and dispatched by id, and TypeScript
  enforces this at compile time without help from a rule.
- `BlastRadiusAnalyzer` — the one domain class `conducks-core` registers and later fetches by id.

It was removed from the other twenty-seven, along with the `id`/`type`/`description` fields that
existed only to satisfy it. `BaseAnalyzer`'s `abstract readonly id` went with them: it forced every
analyzer subclass to invent an id when only one subclass's id is ever read, which is the same
contract leaking one level down.

`src/lib/core/parsing/language-plugin.ts` was DELETED. Its abstract class implemented the contract,
nothing extended it, and the two interfaces it exported were imported by nobody — 53 lines of a
dead abstraction that existed to satisfy a rule.

The sentinel rule `require-conducks-component` was removed. `require_heritage` remains available as a
rule TYPE, and `domain-visibility-rule` stays because exporting a domain class is a real property
that a real consumer depends on.

**Not chosen: making all forty-two conform.** It buys uniformity, and it pays for it with a false
`type` on fourteen services and a further degradation of the `IMPLEMENTS` signal. Wrong metadata is
worse than absent metadata in a tool that publishes structure.

**Not chosen: keeping the rule and widening `ComponentType`.** Adding `'service' | 'engine' | 'pool'`
until every class fits produces a vocabulary that classifies nothing, which is a taxonomy in name
only.

**Not chosen: leaving the twenty-seven implementations and merely dropping the rule.** That was the
first plan and it is the worst outcome: the graph keeps 37% of its `IMPLEMENTS` edges meaningless
while the codebase states no position at all. If the contract is not needed, it goes.

## Consequences

`IMPLEMENTS` fell from 84 to 54, and edges into the marker from 31 to 1. Every remaining one carries
behaviour: `ConducksCommand` 39, `ILanguagePlugin` 13, `ConducksProvider` 1. Any longitudinal
comparison of edge counts across this date will show a large drop that is a cleanup rather than a
regression.

Twenty-seven classes lost a stable `id`. Nothing read it, but a future diagnostic that wants to name
a service now has the class name and nothing else. If a domain-service registry is ever built, the
contract goes back on — with the registry, which is the point of this record.

The `hub-overload-prevention` rule is scoped to `src/registry` and was never affected, but the
marker's fan-in dropping by 30 edges changes PageRank slightly for everything near it. Gravity values
before and after this date are not comparable.

`Open:` the vault holds TWO nodes for this interface — the real one at `contracts/types.ts` with
gravity 0.0223, and a bare `conduckscomponent` with gravity 0 created by an unresolved heritage
target. Every marker edge that pointed at the bare node was invisible to any query keyed on the real
one, which means the 31 above may undercount. Whether unresolved heritage targets should be induced
like call targets are, or refused like ADR 0051 refuses unresolved handovers, is unanswered. Carried
by todo25#P7 — ANSWERED by ADR 0053, and the question's two options were both wrong: the target was
neither external nor unresolvable, it was simply never RESOLVED, because heritage was missing from
`IntraLinker.RESOLVABLE_TYPES`. 72 of 73 now resolve and the duplicate node is gone.
