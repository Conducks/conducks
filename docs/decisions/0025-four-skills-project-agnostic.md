# 0025 — Four skills, written for any project, saying what to do

Status: Accepted
- Amends: 0018 (which established skills as the guidance surface; this sets what they contain)
- Enforced by: tests/unit/interfaces/tools/skills-tool-surface.test.ts
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-26

## Context
Conducks shipped eight skills. Five of them — exploring, debugging, impact-analysis, refactoring,
governance — were the same shape repeated: a paragraph of framing, a probe list, then rules. They
overlapped heavily (three told the reader to query the graph before grepping) and every one of them
loaded separately, so an agent paid for the framing five times to get five short probe sequences.

Worse, they were written for THIS repo while shipping to every repo. They named `src/lib/core`,
`src/registry/index.ts` and `config/sentinel.json` as if universal, and cited internal records
inline — "structure is queried, never written (ADR 0011)". An agent working in someone else's project
reads that and has no ADR 0011 to open. A reference to a record the reader cannot see is noise
wearing the costume of authority.

Much of the text also spent its words on prohibitions. A skill that lists what not to do leaves the
reader to infer what to do, which is the harder half.

## Decision
**Four skills:** `conducks-guide` (entry point and tool surface), `conducks-workflows` (explore,
debug, impact, refactor, audit — one probe sequence each), `conducks-docs` (the documentation
standard), `conducks-cli` (the terminal surface). The five overlapping skills merge into
`conducks-workflows`.

**Write for a project that is not this one.** No internal record numbers, no paths from this
repository presented as universal. Where a rule needs grounding, state the cost in the sentence
itself — the reason travels, the citation does not.

**Say what to do.** Instructions, not prohibitions. "Confirm with grep before deleting" carries the
same rule as "never auto-delete" and also tells the reader their next action. Prohibitions survive
only where the failure is silent and the correct action is genuinely nothing.

**Retiring a skill deletes it.** Sync otherwise never deletes, and that stays true for skills
conducks still ships — but a retired skill keeps loading, keeps costing tokens and keeps teaching
guidance that was merged away. The installer carries an explicit retired list and removes those
names from every scope; an explicit list means a skill the user wrote is never caught by it.

## Consequences
782 lines across eight skills becomes 609 across four, and the five-way overlap is gone. A reader
picking up "how do I check this is safe to change" gets one file instead of choosing between three.

The consolidated `conducks-workflows` is less discoverable by name than `conducks-refactoring` was —
someone searching for a refactoring skill will not find one. The description carries all five
subjects to compensate, and the guide names it.

Removing internal citations costs this repository something real: an ADR number is exactly how a
conducks maintainer would find the reasoning. That trade is deliberate — the skills ship to everyone,
and the maintainers have the records in front of them.

Retiring skills also exposed a build defect: `cp -r src/resources/* build/` never removed anything,
so five deleted skills kept shipping from the build directory and reinstalled themselves. The build
now clears the resource directory first.
