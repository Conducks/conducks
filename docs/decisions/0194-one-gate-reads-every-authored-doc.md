# 0194 — one gate reads every authored doc, and the convention IDs stop being addresses
Status: Accepted
- Date: 2026-09-18
- Resolves: 0193
- Amended by: 0195
- Enforced by: tests/unit/domain/docs/docs-grammar.test.ts

0195 changes only HOW a frozen record resolves a retired id. This record said each of the 43 frozen
records carrying a citation is stamped with where its rules went; 0195 replaces those 43 stamps with
one translation table it carries itself, and leaves the frozen records untouched. Everything else
here stands: the ids are still retired, and citations in live files are still rewritten.

## Context

ADR 0193 deletes `architecture.md`, `features.md`, `conventions.md` and `memory.md` and moves every
fact into the per-feature notes under `docs/visuals/modules/`. It left three questions open and
handed them to todo79#P0. This record answers all three.

The questions were not incidental. Each one decides whether the change makes the tree harder to rot
or merely moves the rot somewhere nothing reads.

- **The `CONDUCKS-N` IDs.** Measured on 2026-09-18 at `4c9334e`, by
  `grep -rEo 'CONDUCKS-[0-9]+' --exclude-dir=node_modules .`: **256 citations across 131 files**,
  against **49 definitions** in `conventions.md`. Every defined ID is cited somewhere and every
  cited ID is defined — there are no dangling ones today, which is what makes deleting the file a
  clean break rather than a cleanup. The citations are not confined to docs: 91 are in `src/` and
  `tests/` code comments, 13 in `legacy/`, `archive/` and `deep_clean.md`, 5 in `scripts/` and
  `tools/`, and **10 under `docs/visuals/` — 4 in module notes and 6 in their renders**.
- **Linting the notes.** ADR 0193 moves binding rules into a note's `**Boundaries:**`. Today a note
  is anchor-checked by `visuals-lint` and never grammar-checked by `docs-lint` (`conducks-docs`
  §5.4). So the change would put the repository's binding rules into the one doc class no grammar
  gate reads.
- **The completeness bar.** ADR 0193 states it — from the notes alone a reader can describe the
  system end to end without opening the code — and nothing in it says what checks that.

## Decision

**The `CONDUCKS-N` IDs are retired. Every citation is rewritten to name the gate or the note that
holds the rule.** All 256, including the ones in source comments and in frozen records where the
rewrite is a stamp rather than an edit. A rule that survives as a gate is cited by its test path; a
rule that lands in a note's `**Boundaries:**` is cited by that note's path.

*Not chosen: keeping the IDs with their definitions moved into the notes.* It is the smaller diff by
a wide margin — zero citations touched against 256 — and it was rejected because it keeps a second
addressing scheme alive with no file defining it. An ID whose definition is "grep for it" is an
address that resolves by luck, and `docs-lint` cannot check it the way it checks `todoNN#PN` and
`ADR NNNN`. The whole point of 0193 is that an ungated claim rots; an ungated address is the same
defect wearing a number.

*Not chosen: a stripped `conventions.md` kept as an ID registry.* It contradicts 0193's decision
that the four files are deleted, and it is one more hand-maintained index — the thing `conducks
glossary` exists to avoid.

**A module note is grammar-linted. `docs-lint` gains it as a fourth type, and becomes the single
gate over every authored doc.** `conducks docs-lint` runs the note grammar AND invokes
`visuals-lint`, so one command is the whole docs gate and there is no second command a session can
forget. The linted set therefore does not fall from six types to three as 0193's `## Consequences`
states — it falls to four: `todos`, `decisions`, `handover`, and the notes. That sentence in 0193 is
what this record resolves.

What the note grammar requires, and nothing more:

| required | why |
|---|---|
| `# <module> — <one line>` | the title every governed doc carries |
| `**Layer:**` `**Responsibility:**` `**Boundaries:**` `**Uses:**` | the four fields a note must answer. `**Uses:**` is what the completeness bar rests on |
| `## Features` and `## Glossary` present, even if the body says `none` | `conducks glossary` and `conducks features` count notes carrying no section (ADR 0124). A missing section and an empty one must be different states |
| a tombstoned note carries `Status: deprecated` | 0193's tombstone rule needs a machine-readable mark, or a removed feature's warning is prose nobody greps |

`## Traps` stays optional; a feature with no trap must not be pushed into inventing one.

*The cost, stated.* This is a second gate over a file whose value is prose, and a linter can make a
prose file worse by rewarding the shape over the content. The required set is deliberately small for
that reason: it checks that each question was answered somewhere, never how well. Nothing here
counts words, checks a section is non-trivial, or fails a short note.

**Nothing checks the completeness bar, and that is written down rather than left implied.** The bar
stays stated in `conducks-docs` §8. The working check is the one already happening: a session reads
the notes against the code it is about to touch, and fixes or extends a note it finds wrong, in the
same change that revealed it — `conducks-docs` §8's "code outranks the doc", applied to notes.

*Not chosen: an LLM-judged completeness eval.* It would feed the notes to a model, ask for a
description of the system, and score it against the code. It is the only thing that would actually
measure the bar, and it is a non-deterministic gate in a repository whose argument is that a gate
must be deterministic. A bar that fails differently on two runs teaches people to re-run it.

So the honest position is the one ADR 0124 demands: the completeness bar is an UNSCORED claim, and
every report that lists what the gate covers says so beside the counts it does check.

## Consequences

The citation rewrite is the largest mechanical piece of todo79 and it reaches well outside `docs/`.
91 of the 256 citations are in `src/` and `tests/` comments, spread across roughly ninety files, so
the work is not a docs-only pass and the full typecheck and suite are part of its gate.

Frozen records citing an ID — ADRs and closed todos — are stamped, never edited (`conducks-docs`
§2). The stamp names where the rule went. The reasoning in those records keeps the ID in its own
prose, because rewriting it would change what the record said at the time.

Two citation sites are their own cases and neither was obvious before the count was taken. **Four
module notes already cite a `CONDUCKS-N`**, and notes are where the rules are moving TO — so those
four rewrite into a self-reference unless the rule lands in the very note that cites it, in which
case the citation is deleted rather than rewritten. **Six `.html` files under `docs/visuals/` cite
one too**, and those are DERIVED (ADR 0140): they are regenerated, never hand-edited, and a rewrite
that touches them by grep is a change the next render silently discards.

`docs-lint` grows a fourth grammar and `visuals-lint` becomes a step inside it rather than a
separate command anyone runs. Every caller of `visuals-lint` — the gate scripts, `conducks.json`,
CI — has one more thing to point at the combined command, and `visuals-lint` stays callable alone
for the `--stamp` workflow, which is per-page and not a gate.

The notes now fail a build. That is the intended change and it is also the new risk: a note is the
one governed file a person writes freehand while thinking, and a gate that rejects it mid-thought
teaches people to write the note last. The required set is four fields and two sections for exactly
this reason.

ADR 0193 is not superseded. Its decision stands unchanged; only its `## Consequences` count of the
linted set is corrected here, and its three open questions are answered.
