# 0055 — a node is a symbol, not a fragment of source
Status: Accepted
- Amended by: 0096
- Enforced by: tests/unit/core/parsing/guess-confidence.test.ts and tests/integration/features/pulse-writes-every-table.test.ts (a call target that is not an identifier path produces no edge, and no edge survives a pulse pointing at a target nothing could resolve)
- Builds: 0046
- Amends: 0053
- Date: 2026-07-31

## Context

The vault held 1,692 induced "library symbols" and **1,480 of them were not symbols at all.** Not
merely unresolved — not names. The ids included entire multi-line array literals, complete with the
newlines and comments of the source they were cut from:

```
['analyze', 'clean'].includes
[...board.decisions].sort
"[\n    \"\", \"desktop\", \"documents\", ...\n  ].map"
```

Two faults compounded. `CallProcessor` captured the RECEIVER TEXT of a method call verbatim, so a
call on a literal produced a "target" that was a chunk of source. An earlier guard (todo24) rejected
targets containing parentheses, which caught chained calls and let brackets, quotes and newlines
straight through — a denylist of characters against an unbounded space of expressions.

Then induction materialised every one of them. It cannot distinguish "external", "unresolvable" and
"never a reference", and ADR 0053 established that it defaults to the first. So the graph gained a
node for every array literal anyone called `.map` on.

The same defect produced a quieter version: `results.forEach`, `line.trim`, `args.includes` — real
identifier paths, but calls on LOCAL VALUES. `path.resolve` looks identical and is genuinely
external. Induction had no way to tell them apart and invented nodes for all of them.

## Decision

**A call target is recorded only when it has the shape of a symbol reference**, and **a target is
induced only when it is genuinely external.** Three rules, each addressing one of the faults above.

1. **Shape is an allowlist, not a denylist.** A target must be an identifier path — optionally
   dotted or `::`-scoped, with generic arguments stripped. The form is polyglot on purpose: a first
   version was written for TypeScript alone and the suite caught it rejecting C#'s
   `System.Nullable<int>` and Rust's `std::fmt::Result`, both of which are real symbol paths.
   Brackets, quotes, whitespace and newlines stay rejected, because those are what actually separate
   a name from an expression.

2. **Induction requires an external RECEIVER.** A dotted target is external only when its head is a
   module this project depends on, taken from the ECOSYSTEM nodes the manifest parser already
   produces — `path`, `fs`, `chalk`, `@jest/globals`. So `path.resolve` is induced and
   `results.forEach` is not. A bare unnamespaced word is never induced: it is a local symbol the
   resolver failed to place, and inventing a node for it hides the failure.

3. **A guess that never landed is deleted at the end of the pulse.** After IntraLinker has rebound
   what it can and induction has materialised what is external, an edge still pointing at nothing
   AND carrying the give-up confidence from ADR 0046 is swept. The confidence floor is the safety:
   an edge at 0.85 that still dangles is a real reference the resolver could not place — a finding,
   not a row to delete — and it survives.

**Not chosen: keeping the guessed edges because ADR 0046 already labels them.** The label works, and
a consumer can filter on it. But 2,236 edges pointing at `line.trim` and `args.includes` are not a
filtering problem; they are noise that no query wants and every orphan check has to step around.
Pricing a guess was the right call for an edge that MIGHT resolve later. These never can.

**Not chosen: dropping them at parse time instead.** `IntraLinker`'s method-tail rule resolves a
real share of dotted targets, so deleting them before it runs would lose genuine edges. The sweep
belongs after every resolver has had its chance, which is the same ordering ADR 0051 arrived at.

**Not chosen: a denylist of more characters.** That is what was already there. The space of
expressions is unbounded and the space of symbol names is not, so the allowlist is the only side of
this that can be written down.

## Consequences

Measured on this repository, before and after a clean re-analyze:

| | before | after |
|---|---|---|
| induced "library symbols" | 1,692 | 140 |
| …that were bare single words | 129 | 0 |
| nodes | 5,358 | 3,829 |
| edges | 15,049 | 12,621 |
| dangling targets | 54 | 214 |
| dangling targets at guess confidence | — | 0 |

**Node and edge counts fell by a quarter and a sixth, and that is the point rather than a cost.** Any
trend crossing this date is comparing two different definitions of "node".

Dangling targets ROSE, from 54 to 214, and the rise is the honest number. It was low before because
induction was manufacturing a node for anything that dangled — the count measured induction's
appetite, not the graph's integrity. Every one of the 214 now carries high confidence, which makes it
a reference the resolver genuinely could not place: a finding worth investigating rather than noise
to scroll past.

This amends ADR 0053. That record said a dangling reference has three causes — external,
meaningless, or not yet resolved — and that induction treats them all as the first. It named the fix
for the third (resolve it) and left the second unaddressed. Rules 1 and 2 here are that second case:
some things induction was asked about were never references at all.

`Open:` four route nodes have SQL SELECT statements as their ids, captured from query strings in
diagnostic scripts by the route pattern in `FlowProcessor`. It is the same class as this record —
source text mistaken for a symbol — in a different processor, and the count is small enough that it
was left rather than fixed blind. Carried by todo25#P8.
