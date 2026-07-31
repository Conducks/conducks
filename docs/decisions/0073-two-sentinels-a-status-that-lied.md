# 0073 — two sentinels, and a status that lied
Status: Accepted
- Enforced by: tests/unit/domain/governance/audit-status.test.ts
- Date: 2026-07-31

## Context

Two findings from todo22's triage of the open board turned out to be the same class of problem
counted twice — a declared thing that does not do, or does not say, what it claims — just in two
different shapes.

**The name collision.** `sentinel.ts` (`ConducksSentinel.validate()`, evaluated by `conducks audit`
against the declarative, user-editable per-node policies in `config/sentinel.json`) and
`sentinel-rules.ts` (`auditWithRules()`, evaluated by `conducks guard` against a small hardcoded set
of graph-wide structural conditions) are unrelated mechanisms. Both exported an interface literally
named `SentinelRule`. Measured 2026-07-31: `config/sentinel.json` holds 3 rules
(`domain-visibility-rule`, `hub-overload-prevention`, `sentinel-config-presence`) and
`sentinel-rules.ts` holds 3 built-ins (`no_cycles`, `rank_violations`, `layer_boundaries`) — disjoint
sets, no overlap. Nothing says the two are different, so a reader told "audit found violations, go
fix them" has no way to know that fixing them does nothing for the layer contract `guard` reads from
the other file.

**The status that lied.** `AuditResult.status` (`audit-service.ts`) declares
`'HEALTHY' | 'STABLE' | 'DECAYING' | 'INSUFFICIENT_DATA'`. `AuditService.audit()` never returned
`INSUFFICIENT_DATA` — every zero-row result read as `STABLE`, so `audit.ts:30`'s dedicated branch for
it was unreachable dead code. Verified live: `conducks audit --history` on this repo prints "No
consistent structural decay patterns found" (the `STABLE`-with-zero-hotspots message), never the
`INSUFFICIENT_DATA` path. This is exactly the shape ADR 0044 fixed for `DriftEngine.compare()`: the
archeological query joins `node_history` to itself with `LAG() OVER (PARTITION BY id)`, which is
NULL whenever a node has only one historical row — currently ALWAYS, per `persistence.ts`'s
one-row-per-id upsert (the same root cause ADR 0044 and `tests/integration/features/evolution.test.ts`
already named for drift, and todo20#P4 tracks the storage fix). A comparison that ran and found
nothing to compare is not the same fact as a comparison that ran and found no decay, and collapsing
them into `STABLE` is the "check that ran on nothing is not a pass" failure by name.

## Decision

**The status: implement `INSUFFICIENT_DATA`, do not delete the branch.** `AuditService.audit()`
(`audit-service.ts`) now returns `status: 'INSUFFICIENT_DATA'` when the archeological query returns
zero rows, instead of `'STABLE'`. `audit.ts:30`'s branch is reachable as of this change, not only once
todo20#P4 lands — the query already returns zero rows on every run today (single-row-per-id storage),
so the mislabeling was live, not latent. Pinned in `tests/unit/domain/governance/audit-status.test.ts`:
a stub with no historical rows must report `INSUFFICIENT_DATA` and never `STABLE`; a stub with a real
comparison and low drift must still report `STABLE`; a stub with more than 5 hotspots must report
`DECAYING`. Reverting the fix (putting `'STABLE'` back on the zero-rows path) turns the first case red
— confirmed live, then restored.

**Not chosen: deleting the branch until todo20#P4 lands.** ADR 0044 already argued the general case —
a caller must be able to tell "stable" from "could not assess" without parsing prose — and that
argument does not weaken here just because the underlying data problem (single-row-per-id history) is
tracked elsewhere. The fix is one status value on an existing, already-correct three-way branch in
`audit.ts`; there is no dead code left to justify removing.

**The catch-and-continue path is folded into the same branch, not split further.** `rows` stays `[]`
whether the query found nothing or the query threw and was caught above (`archeologicalQuery` catch
block, `audit-service.ts`) — both now read `INSUFFICIENT_DATA`. `DriftEngine` distinguishes these two
as `INSUFFICIENT_DATA` (ran, empty) vs `UNAVAILABLE` (could not run), but `AuditResult.status` was
never declared with an `UNAVAILABLE` member and nothing in this todo asked for one. Adding it now
would be exactly the kind of unrequested widening this project has been burned by — a second axis of
distinction with no caller reading it. Left as `Open:` below.

**The name collision: keep the two mechanisms separate; the merits argue for it independent of file
ownership.** `sentinel-rules.ts`'s conditions are hardcoded TypeScript, extended by writing code, and
are what `guard` reads before a commit — a fast, narrow, code-reviewed set. `sentinel.ts`'s rules are
declarative JSON any project can edit without touching TypeScript, and are informational governance
surfaced by `audit`, not a blocking gate. Merging them would either let an edit to
`config/sentinel.json` change what blocks a commit — a project owner could accidentally make every
commit fail by adding an overly strict declarative rule to what is meant to stay a narrow, reviewed
gate — or force `guard` to pay for evaluating arbitrary user policy on every pre-commit run, which
Phase 1 of this todo already restricted to a full re-analysis pre-commit cannot afford. The measured
disjointness (3 rules, 3 built-ins, zero overlap) means a merge loses no coverage either way; the
reason to keep them apart is what each is FOR, not what they currently contain.

**Renamed what this change owns; named what it does not.** `sentinel.ts`'s `SentinelRule` interface
is renamed `ProjectRule` — it was never imported by name outside that file (confirmed by grep before
renaming), so the change is self-contained. `sentinel-rules.ts`'s `SentinelRule` keeps its name: it is
imported by `governance/index.ts` (`auditWithRules()`) and read by `guard.ts`, both outside this
change's file ownership under the run's multi-agent lane discipline. Renaming it here without updating
those call sites in the same turn would not close the collision, it would relocate it. Both files now
carry a header comment naming the other mechanism, what it evaluates, and which command reads it —
the reader-facing half of the fix that needed no unowned file.

**Not chosen: leaving the `memory.md` "names that collide" entry unwritten with no note.** `memory.md`
is root-only and outside this change's owned files under the same lane discipline. The fact belongs
there per the docs standard (§6.5, "names that collide") — the in-code header comments here are the
closest substitute reachable from owned files, not a substitute for the memory entry itself.

## Consequences

`AuditResult.status === 'INSUFFICIENT_DATA'` is now a real, reachable branch; `conducks audit
--history` on a fresh clone or before a second comparable pulse now prints the `INSUFFICIENT_DATA`
warning instead of a false "no decay found". A caller matching only on `'STABLE'` as "not decaying"
already handled this correctly by accident (their check still passes on `INSUFFICIENT_DATA` too), but
a caller relying on the printed message text for either state sees new wording.

`ProjectRule` is a breaking rename for anything outside this repo importing
`{ SentinelRule } from 'sentinel.js'` directly rather than via the `governance` barrel — the barrel
never re-exported that name (only `sentinel-rules.ts`'s `SentinelRule` is re-exported as
`SentinelRule` from `governance/index.ts`), so no in-tree caller was affected; confirmed by grepping
every import of `sentinel.js` in `src/` and `tests/` before the rename.

`Open:` whether `AuditResult.status` should gain an `UNAVAILABLE` member mirroring `DriftResult`, to
separate "the query threw" from "the query ran and found nothing". No todo carries this yet — todo22
Phase 3 asked only that the declared-and-unreturned state be implemented, which this delivers; a
finer split is a new decision, not implied by this one.

`Open:` whether `sentinel-rules.ts`'s `SentinelRule` should be renamed to close the collision
completely, and whether `sentinel.ts`, `config/sentinel.json` or the `ConducksSentinel` class should
also be renamed to stop the word itself colliding at the mechanism level, not just the type level.
Both touch `governance/index.ts` and `guard.ts`, outside this change's ownership; no todo carries this
yet. The `memory.md` "names that collide" entry this decision would normally write in the same turn
(§6.5) is the same gap, for the same reason — waiting on whichever session next owns those files.
