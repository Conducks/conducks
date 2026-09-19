# 0190 — the engine 0028 named as its replacement is deleted, and the rule it was kept for is what gets pinned
Status: Accepted
- Enforced by: tests/unit/adr-invariants.test.ts (no daac module under src/, `core/graph/cluster-rule.ts` still present, and `lib/domain/visual` absent — each mutation-checked to fail on its own)
- Amends: 0028, 0054
- Amended by: 0192
- Date: 2026-09-05

0192 moves the renderer this record left in place: the sentence below saying it stays in `src/resources/mirror/` is superseded by `src/interfaces/web/mirror/public/`. The REASON given here still holds and is why it did not move into the domain door — a domain door may not hold an interface asset. What this record did not ask is whether `resources/` was the right interface-side home.

This amends 0028 by moving what its invariant points at — from `mirror.engine.ts` to the clustering rule itself, which is the thing 0028 was actually protecting. It amends 0054 by taking the option 0054 named and declined. Both stay Accepted and both stay binding: 0028's deletion of DAAC and 0054's SQL wave are untouched.

## Context

ADR 0028 deleted DAAC and named `mirror.engine.detectCluster()` as the implementation that survived
it. `tests/unit/adr-invariants.test.ts` pinned that by asserting `mirror.engine.ts` exists — a guard
against a deletion silently coming back.

Three months of decisions then moved everything the guard was protecting, and left the guard where it
was.

ADR 0054 put the visual wave in SQL, so `conducks mirror` stopped calling the engine at all. It tried
deleting the engine, the invariant suite failed, and it restored the file — recording that "whether
ADR 0028 should be revisited is a separate decision that belongs to whoever makes it, not to a
cleanup pass". It named the cost it was accepting: two implementations of one clustering rule, which
drift.

ADR 0079 then paid that cost off. The rule moved to `core/graph/cluster-rule.ts`, both callers were
pointed at it, and `mirror.engine.detectCluster()` became a four-line delegation. **The reason 0054
gave for the engine still earning its place was gone**, and nothing reopened the question.

What was left is 232 lines that nothing on any live path calls, plus 16 tests exercising them. The
only thing holding the file up was a test asserting a filename — and `prune` cannot see it, because
`src/lib/domain/visual/index.ts` re-exports the class and a barrel re-export counts as an incoming
edge. Measured: the sole reference to `MirrorEngine` in `src/` is that one-line barrel; every other
mention is a comment about its history.

## Decision

**The engine is deleted** — `mirror.engine.ts`, its `index.ts` barrel, the `domain/visual` folder,
and `tests/unit/domain/visual/mirror-engine.test.ts`. `domain/visual` also leaves the feature-door
list in `tests/architecture/feature-doors.test.ts`, because it is no longer a feature or a folder.

**0028's invariant is repointed, not dropped.** It now asserts `core/graph/cluster-rule.ts` exists.
That is the same guard aimed at the thing it was always for: 0028 deleted DAAC *in favour of a
clustering rule*, and the file that happened to hold that rule in 2026-07 is not the decision. The
anti-resurrection half — no `daac` module anywhere under `src/` — is unchanged.

**A third invariant is added, against this deletion coming back the way 0028's nearly did.**
`lib/domain/visual` must not exist. Each of the three fails on its own mutation and on no other: hide
`cluster-rule.ts`, recreate `domain/visual`, plant a `daac` file — one red test each, verified.

**The mirror gets a door, and the data half moves behind it.** `GatewayService` sat in
`domain/analysis` only because that door already existed; it answers the visual wave and hydrates a
node, which is the mirror's business and not analysis's. It moves to `src/lib/domain/mirror/` with an
`index.ts` door registered in `tests/architecture/feature-doors.test.ts` — mutation-checked: an
import reaching past it to `gateway.js` turns that gate red and nothing else. The renderer stays in
`src/resources/mirror/` and the routes in `interfaces/web`, because a domain door may not hold an
interface layer. The two surviving wave tests move to `tests/unit/domain/mirror/`, which repoints
0054's `- Enforced by:` address — the same test proving the same claim from a folder no longer named
after a deleted module.

**Not chosen: superseding 0028.** Its decision — DAAC is deleted, and a fixture shaped to a
misunderstanding will confirm the misunderstanding — is correct and still binding. Only the pointer
moved, which is an amendment.

**Not chosen: keeping the engine and deleting only its tests.** That leaves the 232 lines and removes
the one thing describing them. The tests were not the problem.

**Not chosen: porting the 16 tests onto `cluster-rule.ts`.** They pin what `MirrorEngine` did with
the rule's ANSWER — layer filtering, edge promotion and clipping, cluster-center seeding, the noise
mass override — not the rule. `cluster-rule.test.ts` already pins the rule directly, per 0079. There
is nothing left for the 16 to cover once their subject is gone, and re-aiming them at code that does
not implement that behaviour would be writing tests to fill a number.

## Consequences

232 source lines, one barrel, one folder and 16 tests leave the tree. No behaviour changes — nothing
on a live path called any of it, which is what took three ADRs to establish and one line of `grep` to
confirm.

The taxonomy comments in `capture-tags.ts` and `contracts/taxonomy.ts` still name `mirror.engine` in
their list of four NAMESPACE consumers. They are ADR 0100's recorded reasoning about the state at
that time, quoted in code, and they are left alone deliberately: rewriting another decision's
justification while cleaning is how a cleanup starts making calls that are not its own. A reader
counting consumers today will find three.

The lesson is the title of the failure, not of the fix. **A guard that names a FILE outlives the
reason it was written; a guard that names the RULE does not.** 0028's invariant was correct, did its
job once by catching 0054's deletion, and then spent three months protecting a filename after the
thing it cared about had moved somewhere else entirely. The check never failed, so nothing ever
prompted anyone to look at what it was checking.
