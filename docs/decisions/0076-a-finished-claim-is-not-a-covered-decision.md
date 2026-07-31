# 0076 — a finished claim is not a covered decision
Status: Accepted
- Date: 2026-07-31
- Enforced by: tests/unit/domain/analysis/docs-board.test.ts (an ADR whose phases are all done reports `claimed` without an `- Enforced by:` and `proven` with one); tests/unit/domain/analysis/docs-standard-citations.test.ts (every marker the parser accepts is defined in the standard's §5.2 table, and every `ROOT_ONLY`/`DERIVED_FILES` name appears in the standard)

## Context

`buildState` had four values and one of them overclaimed. It is derived from the linked phases
alone:

```
unlinked   nobody wrote `- Builds:` for this ADR
unbuilt    linked, no phase has started
partial    linked, some phase has progress
built      every linked phase is done          <- the problem
```

`built` reads as "this decision is in the code". What it actually measures is "someone claimed this
decision and finished what they claimed". Those are the same fact only when the claim covered the
whole decision, and nothing checks that. An ADR with five consequences and one phase covering one of
them reported `built` the moment that phase finished.

The gap is not hypothetical — it produced two findings that a human caught and the board could not:

- ADR 0035 stated that a project without git degrades to one flat graph. The only task proving it sat
  under a phase tagged `- Builds: 0036`, so 0035 had a consequence no phase claimed.
- ADR 0034 stated that parked tasks in four todos move to `[>]` or `[-]`. Only one was migrated.

Both were found by reading. The board reported both ADRs as linked and fine.

## Decision

**Two candidate fixes were considered and both rejected**, because both try to make prose
machine-countable by changing how ADRs are written:

| candidate | why not |
|---|---|
| each consequence becomes its own `-` bullet, so they can be counted and stamped | produces a count with no MAPPING — five bullets and two phases still cannot be matched up. Worse, a bullet beginning with a capital word parses as a `- Key: value` FIELD (§5.1), so this would silently turn consequences into fields. A live hazard, not a cosmetic cost |
| the ADR names the phases that carry it | duplicates `- Builds:` in reverse. A two-ended stamp that must agree is exactly the failure `crossCheckDecisions` exists to catch, and this adds a second one to keep in sync |

**So the decision is to stop using a word that claims more than the derivation supports**, and to
promote the one field that already IS evidence:

```
claimed    every linked phase is done — the work someone claimed is finished
proven     the same, AND `- Enforced by:` names a file that exists
```

Neither claims that every consequence is covered. `proven` claims that something checked the result,
which is true and useful and costs no new authoring.

`- Enforced by:` is the right carrier because ADR 0058 already made it load-bearing: the linter fails
an `- Enforced by:` naming a file that does not exist, so `proven` cannot be earned by pointing at
nothing.

## Consequences

- `docs-status` distinguishes an ADR that was finished from one that was checked. On this repository
  that is a real split rather than a relabelling — most ADRs carry `- Enforced by:`, and the ones
  that do not are now visibly weaker rather than equal.
- **Full coverage of an ADR's consequences remains unchecked, by decision.** No value in this
  vocabulary means it. That is the honest state: the alternative was a rule that looked like it
  measured coverage and did not, which is what `built` was.
- The two mechanically-checkable drifts that `todo22#P4` identified are now enforced rather than
  listed as candidates: the checkbox markers the parser accepts must be DEFINED in the standard's
  §5.2 table, and every filename `ROOT_ONLY`/`DERIVED_FILES` special-cases must appear in the
  standard. Scoping the marker check to the table rather than the section matters — the first
  version passed with the `[>]` definition row deleted, because the paragraph below still discussed
  `[>]`, and that was found by mutation rather than by reading.
- Still NOT checked, stated so it is a known gap: whether the standard's DESCRIPTION of a rule
  matches the rule's behaviour. A marker can be listed with the wrong meaning and the gate passes.
