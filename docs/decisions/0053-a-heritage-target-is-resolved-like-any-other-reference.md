# 0053 — a heritage target is resolved like any other reference, not induced and not refused
Status: Accepted
- Enforced by: tests/integration/features/heritage-languages.test.ts (a heritage target resolves to a file-qualified symbol rather than a bare name)
- Resolves: 0052
- Date: 2026-07-30

## Context

ADR 0052 left a question: the vault held TWO nodes for `ConducksComponent` — the real one at
`contracts/types.ts` with gravity 0.0223, and a bare `conduckscomponent` with gravity 0. Any query
keyed on one missed the edges pointing at the other.

The question was framed as a choice between two options, and both were wrong. Either
**induce** the bare target as a virtual node the way an unresolved CALL target is induced, or
**refuse** the edge the way ADR 0051 refuses a handover whose producer cannot be found.

Neither, because the premise was wrong. The target was not external and it was not unresolvable — it
is an interface declared in this repository and imported by the file that implements it. It was
simply never RESOLVED, because `IntraLinker.RESOLVABLE_TYPES` was
`CALLS, CONSTRUCTS, TYPE_REFERENCE, ACCESSES`. Heritage was not in the set, so a heritage target
stayed bare through every pulse, and virtual induction then did what it does with any dangling
target: it manufactured a node for it.

That is worse than either proposed option. Inducing a phantom for a symbol that already exists SPLITS
the graph: 30 `IMPLEMENTS` edges pointed at the invention and none at the real interface, so
`impact` on the real one reported nothing while the invention accumulated a fan-in that meant
nothing.

## Decision

**A heritage target is resolved by the same linker that resolves every other reference.** `EXTENDS`
and `IMPLEMENTS` join `RESOLVABLE_TYPES`.

Measured on this repository after the change: **72 of 73 heritage targets resolve** to a
file-qualified symbol, up from zero. The duplicate node is gone. `IntraLinker` resolved 2,654
references where it previously resolved 2,536 — the difference is the heritage edges it was never
asked about.

The one that stays bare is `FilterValidationError extends Error`, which is genuinely external and
therefore correctly falls through to induction. That is the split the original question was reaching
for and could not express: **resolve what is local, induce what is external, and the distinction is
made by the resolver rather than declared in advance.**

**Not chosen: inducing every unresolved heritage target.** It is what was happening, and it invents
a duplicate whenever the target is local — which was 30 of 31 cases here. Induction is right for a
symbol this project does not contain and wrong for one it does.

**Not chosen: refusing an unresolved heritage edge.** ADR 0051 refuses a handover whose producer
cannot be found, and that was right there because a handover edge is meaningless without both ends.
A heritage edge is not: `extends Error` is a true and useful fact even when `Error` is external. The
two cases look alike and differ in whether the unresolved end carries information.

**Not chosen: adding heritage to the fuzzy tier instead.** The fuzzy path guesses by name; the
resolver follows the file's own imports. A heritage clause names something the file imported, so the
evidence is there and guessing is not needed.

## Consequences

Gravity shifts for every interface that other classes implement, because 72 edges moved from phantom
nodes to real ones. `ConducksComponent`'s fan-in and rank are now attributable to it rather than
split across two nodes. Rankings before and after this date are not comparable — the same caveat
ADR 0052 carries, compounding with it.

Anything that queried a bare heritage id will find nothing. Nothing in-tree did, because nothing
could usefully consume a node that did not correspond to a symbol.

The general lesson generalises past heritage and is the reason this record exists rather than a
one-line fix: a dangling reference has THREE possible causes, and induction treats all of them as the
third. It may be external (induce), meaningless (refuse), or simply not yet resolved (resolve).
Induction runs last and cannot tell them apart, so anything that reaches it unresolved gets a node
whether it deserves one or not. `RESOLVABLE_TYPES` is the list that decides which edges get a chance
to be the third case, and it was written once and never revisited when new edge types were added.

**The allowlist itself was the deeper defect, and it is gone.** `RESOLVABLE_TYPES` was an array, so a
newly added edge type defaulted to unresolvable and failed silently — which is how heritage spent
months inventing a duplicate. It is now a `Record<EdgeType, boolean>` classifying every member, so
the COMPILER refuses to build until a new type is decided about. Verified by adding a fake edge type:
the build fails naming the missing key. The judgement still belongs to a person; it can no longer be
skipped by accident, which was the only part going wrong.

`Open:` `DEFINES` and `ALIASES` appear in the codebase as edge types but are not members of the
`EdgeType` union, so the record above cannot classify them and the compiler cannot see them either.
Whether they should join the union — and then be classified — or whether they are strings that were
never meant to be edge types is unanswered. Carried by todo25#P7.
