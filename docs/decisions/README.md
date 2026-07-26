# Decisions — what this folder is

`docs/decisions/` holds architecture decision records: one numbered file per decision, each
recording WHY a choice was made, at the moment it was made. A record is history — it freezes the
reasoning. What is TRUE NOW lives in `conventions.md`, `memory.md` and `features.md`, promoted the
same turn the ADR is accepted.

**There is no index of ADRs here, on purpose.** The list of records and their states is derivable
from the folder, and ADR 0011 says derived structure is queried, never written — a hand-kept index
is the same duplicate a generator would be, and it drifts the same way. To see the current set:

```
conducks docs-status          # active / amended / superseded, grouped
conducks docs-status --all    # include superseded
conducks docs-lint            # grammar + back-link check
```

## How to write one

- **Number is global.** Next = highest anywhere + 1. Filename `NNNN-kebab-title.md`.
- **One decision per file.** If it needs two decisions, it is two files.
- **Skeleton** — `# NNNN — title`, `Status:`, then `## Context`, `## Decision`, `## Consequences`.
- **Promote on accept.** The rule goes to `conventions.md`, the trap to `memory.md`, the capability
  to `features.md`. A reader must never have to open a record to learn how the system behaves today.

## State and relations

`Status:` carries LIFE state only, and it is the one line of an accepted ADR that may change:

| Status | means |
|---|---|
| `Accepted` | binding |
| `Superseded by NNNN` | dead — replaced wholesale, do not act on it |

Everything else is a relation, recorded as a field on BOTH ends, because a one-way stamp is how a
record gets read as current after a later ADR changed it:

| field | mirror on the other file |
|---|---|
| `- Amended by: NNNN` | `- Amends: NNNN` |
| `- Superseded by: NNNN` | `- Supersedes: NNNN` |
| `- Resolved by: NNNN` | `- Resolves: NNNN` |

An **amended** ADR stays `Accepted` and stays binding — part of it changed, so read the amendment
too. Only a supersede kills a record. `docs-lint` fails on a relation that points at a missing ADR
or that the other end does not answer.
