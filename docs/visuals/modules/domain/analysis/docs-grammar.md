# domain/analysis/docs-grammar — the docs standard, enforced

**Part of:** [domain/analysis](../analysis.md). Backs `conducks docs-lint`, `docs-status` and
`bootstrap-docs`.

**Responsibility:** classifying every file under `docs/` by type — todo, decision, features,
conventions, memory, progress, handover, architecture — and checking that each conforms to the
per-type skeleton. It is the mechanism that keeps the conducks-docs standard from being advice.

**Boundaries:** structure only. It checks that an ADR has Context/Decision/Consequences and that a
todo has `Status:` and `## Phase N —`; it has no opinion about whether the content is any good.

**Deferred / not built:** the grammar accepts a bare `Status:` line only. Other projects using this
standard (subject-c) write `**Status 2026-07-17:** …` — richer information in a form the linter rejects.
Whether to loosen the check or conform the docs is unresolved.

## Why the standard is enforced by the tool that ships it

Conducks defines the docs standard and is also its first consumer, so `docs-lint` runs against
conducks' own docs on every change. A standard its author's repo violates is not a standard. The
canonical text lives in `src/resources/skills/conducks-docs.md` and the installed skill is generated
from it — one source, so the rule and the enforcement cannot drift apart.

## Governed vs free-form is a deliberate two-tier design

Governed types get a skeleton and are linted. **Architecture docs and soft folders
(`product/`, `business/`, `design/`, `brand/`) are free-form and never linted.**

That exemption is the point of ADR 0015, and it was a correction: architecture was briefly treated as
DERIVED — something a tool generates — which is banned (ADR 0011). Wiring is queryable and rots in
prose, so it is never written down; but a human explaining a module's *intent* is exactly what a doc
is for, and no skeleton should constrain it. Hence `architecture/**/MODULE.md` classifies as authored
and passes untouched, while `map.md` / `drift.md` remain forbidden as derived artefacts.

## Living vs record

The classifier encodes the standard's core distinction: living files (features, conventions, memory,
architecture) are overwritten in place; records (decisions, todos, progress, handover) are appended
and never mutated. An accepted ADR is immutable — a later one amends or supersedes it, and the index
carries the state.
