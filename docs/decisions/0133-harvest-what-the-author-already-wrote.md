# 0133 — harvest what the author already wrote

Status: Accepted
- Date: 2026-08-04
- Builds: 0132
- Enforced by: todo40 — no test yet; this ADR states the target the work is measured against

## Context

Three questions a developer asks about a symbol. Scored on this repository, today:

| question | answer today |
|---|---|
| where is it? | `advisor.ts:203`, kind BEHAVIOR — correct |
| where is it used? | the right callers, presented badly — ADR 0132 |
| **what does it do?** | **nothing.** `context calculateSplitScore` returns its neighbours: `ConducksAdvisor, getNeighbors, ConducksNode, math` |

The graph stores STRUCTURE and answers structural questions well. It stores no MEANING, so the one
question a newcomer asks first has no answer at all — from conducks or from grep.

The meaning is already written. Every function in this codebase carries a docstring above it, often a
long one explaining the trap it exists to avoid. `calculateSplitScore` has `Conducks — SplitScore(M) =
Betweenness(M) + Entropy(M) + Churn(M) - Cohesion(M)` sitting one line above the declaration, in the
file, parsed by tree-sitter on every pulse, and thrown away.

We are not missing the data. We are discarding it.

## Decision

**`analyze` harvests the doc comment attached to each symbol** — JSDoc, docstring, `///`, whatever the
grammar marks as leading the declaration — and stores it on the node. Tree-sitter has already walked
that node; the comment is a sibling in the tree, not a new parse.

**It is served asymmetrically, by how much room the reader has:**

| surface | how much |
|---|---|
| header of any symbol answer | the FIRST LINE only: `format — "Trims a user-supplied name."` |
| `explain` | the full text |
| each caller in a list | nothing — a docstring per row is noise, not context |

**One call answers both questions.** An agent asking "where is X used" asks "what is X" next almost
every time; answering both in one response halves the round trips, which is the currency ADR 0132
identified as the real one.

**Rejected: generating a summary.** The author's sentence is evidence; a generated one is a guess
wearing the same font, and this project has spent 30 ADRs learning to tell those apart. Where no
docstring exists the field is EMPTY and says so — never inferred from the name, never filled by a
model. An undocumented function is a fact about the codebase worth reporting.

**Rejected: storing the comment in the metadata blob.** It is a real column, because a column can be
searched — and "find the function that mentions retry" is the query this unlocks.

## Consequences

- Vault grows by roughly one comment per documented symbol. Measurable before committing to it: sum the
  leading-comment bytes on this repository and compare to the current 23 MB vault.
- A stale docstring is now surfaced rather than hidden. That is an improvement even when the text is
  wrong — a lie you can see beats one buried in a file nobody opened.
- Opens a second capability with no extra storage: search over intent. `query --doc "retry"` finds the
  function whose PURPOSE mentions retry, which neither grep nor today's conducks can do — grep finds
  the word wherever it appears, including in the comment of an unrelated function.
- Language coverage is uneven by construction: the grammar decides. Python docstrings sit INSIDE the
  body, JSDoc sits above — the harvester must ask the grammar, not assume a position, and must record
  which languages it actually covers rather than implying all of them.
