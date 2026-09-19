# conducks-docs · decision records

Contents: §6.6 the ADR — the template, `- Enforced by:`, the rejected option, relations stamped on
both ends, and the open question.

Open this when writing an ADR, amending or superseding one, or leaving a question open in one.

### §6.6 `decisions/NNNN-title.md`

```markdown
# NNNN — <title>
Status: Accepted | Superseded by NNNN
- Enforced by: <the test or symbol that proves it is built — a repo-relative path>
- Date: <YYYY-MM-DD, the day it was DECIDED>
- Amended by: NNNN, NNNN        OPTIONAL — only once an amendment exists

<what each amendment changed, in prose — omit this too when there are none>

## Context
## Decision                     the call, and what was NOT chosen, and why
## Consequences                 what it costs, and any `Open:` question (below)
```

**`- Enforced by:` names a test that would FAIL if the decision were reversed.** That is the whole
criterion — the same one §6.7 applies to a done task. A broad suite that merely exercises the feature
does not qualify; point at the case that pins THIS call. With no such test yet, leave the field off
and let the record report as unbuilt, which is true.

**Omit a field you have nothing to put in.** Every relation field (`- Amended by:`, `- Supersedes:`,
`- Resolved by:` …) appears only once that relation is real. An empty value is not a placeholder the
tooling understands; it reads to the next person as a link that exists.

**The rejected option goes under `## Decision`, not `## Context`.** Context is the situation that
forced a choice; Decision is the choice, which includes the roads not taken. An ADR is prose, and
checkboxes and requirement lists belong in the todo that implements it.

**One decision per numbered file.** Two calls in one record cannot be superseded separately — the
second dies with the first.

**An ADR that adds a benchmark or scenario set states the MUTATION that proves it.** Name the
deliberate break, and name which scenarios go red under it — the scenario written for that break, not
merely some other one. A scenario that has only ever been green is unproven, whatever the tally says:
measured, six scenarios were wrong before the tool they scored was, and a green suite over wrong
fixtures reads exactly like a green suite over a correct tool.

`Status:` carries life state only and is the one line of an accepted ADR that may change. Only a
supersede kills a record. Every other link is a field **stamped on both ends**:

| this record | the other record |
|---|---|
| `- Amended by: NNNN, NNNN` | `- Amends: NNNN` |
| `- Superseded by: NNNN` | `- Supersedes: NNNN` |
| `- Resolved by: NNNN` | `- Resolves: NNNN` |

| relation | means |
|---|---|
| **amends** | part of the record changed. The amended ADR stays `Accepted` and stays binding — read both. |
| **supersedes** | the whole record is replaced. It is dead; act on the new one. |
| **resolves** | the record left a question open (a deferred call, an either/or); this one answers it. The original stays `Accepted` and stays correct. |

**Superseding a half-built record:** add `- Inherits: NNNN (the part never built)` so the remainder
keeps an owner. Lint requires it when the superseded record still has unfinished work.

**Every relation is a TWO-FILE change.** Writing `- Supersedes: 0004` without adding
`- Superseded by: 0011` to ADR 0004 fails lint on both counts: the stamp is one-ended, and if 0004 does
not exist the reference dangles. When you cannot edit the other record in this turn — it belongs to
another service, or you are scoped to one file — write the record without the relation field and say
in prose which record it is meant to replace, so the stamp can be added on both ends at once. A
one-ended stamp is how a superseded ADR keeps reading as current.

**An ADR may leave a question open, and must say so where it can be found.** A decision often settles
the main call and leaves a smaller one unanswered — a rotation scheme, a migration order, an
either/or nobody has costed. The record is frozen, so it cannot grow the answer later. Write the open
question as its own paragraph at the end of `## Consequences`, opening with **`Open:`**, and say what
would answer it. Then either:

| the open question is | do |
|---|---|
| work someone will do | write the todo **in the same turn**, then name it in the `Open:` paragraph as plain prose (`carried by todo14#P2`) |
| a decision someone will make | a later ADR that answers it, stamped `- Resolves: NNNN` against this record's `- Resolved by: NNNN` |

An open question with neither a todo nor a resolving ADR is a decision that quietly rots: the reader
cannot tell whether it was answered elsewhere or forgotten.

**When you cannot write the owner in that turn, name the gap instead.** You may be scoped to one
file, the todo tree may belong to another service, or you may be reviewing rather than authoring.
Say which case you are in, inside the `Open:` paragraph:

| the open question is | and you cannot create its owner now | write |
|---|---|---|
| work someone will do | no todo exists yet | *"no todo carries this yet"* |
| a decision this team will make | the resolving ADR is not written | *"a later ADR must answer this; none does yet"* |
| a decision someone ELSE makes — commercial, legal, a customer call | it may never become an ADR here | *"waiting on <who>; not an engineering call"* — name the owner, not a record |

**Name the gap rather than the number.** A `- Resolved by: 0042` or a `carried by todo14#P2` pointing
at a record nobody wrote fails lint and, worse, reads as an answer that exists. The stamp goes on
when the other record does — the ADR that answers this one adds `- Resolves:` and you add
`- Resolved by:` then, which is the one edit a frozen record is allowed (`SKILL.md` §2).

**`- Builds:` is the one link that is NOT stamped on both ends.** It lives on the todo phase and
points UP at the ADR; the ADR carries no reciprocal field, because an ADR is frozen and a todo is not
— a phase may be added, split or dropped long after the decision, and a frozen record cannot follow
it. The ADR mentions a todo only in prose, and `conducks docs-status` derives the link from the todo
side. A `- Builds:` inside a decision record is a field the parser does not read.
