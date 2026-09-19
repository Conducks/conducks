# domain/docs/docs-grammar — the docs standard, enforced

**Layer:** domain (part of `domain/docs`).

**Part of:** [domain/docs](../docs.md). Backs `conducks docs-lint`, `docs-status` and
`bootstrap-docs`.

**Responsibility:** classifying every file under `docs/` by type — `todo`, `decision`, `note`,
`handover`, `architecture`, `derived`, `prose` — and checking that each conforms to the per-type
skeleton. Four of those are GOVERNED and linted (todo, decision, handover, note); the rest are
classified and left alone. It is the mechanism that keeps the conducks-docs standard from being
advice. The `features`, `conventions` and `memory` types this note used to list are gone with the
files themselves (ADR 0193, ADR 0194).

**Boundaries:** structure only. It checks that an ADR has Context/Decision/Consequences and that a
todo has `Status:` and `## Phase N —`; it has no opinion about whether the content is any good.

**Deferred / not built:** the grammar accepts a bare `Status:` line only. Other projects using this
standard (subject-c) write `**Status 2026-07-17:** …` — richer information in a form the linter rejects.
Whether to loosen the check or conform the docs is unresolved.

**Uses:** nothing — this module parses ONE file at a time from disk and has no idea any other doc
exists; that is [docs-board](docs-board.md)'s job. Backs `conducks docs-lint`, `docs-status` and
`bootstrap-docs`, and runs live inside `conducks watch` via the docs watcher.

## Features

- **Doc-value grammar** (`tests/unit/domain/docs/docs-grammar.test.ts`) — a doc's value is one whole
  line. A value wrapped onto the next line is silently dropped by anything that reads it, so wrapping
  fails the lint rather than reading as valid.
- **ADR state grammar** — an ADR carries its own `Status:` and its own `Amended by`/`Amends` stamp on
  both ends of a supersede; nothing outside the record restates that state, so there is no index to
  drift out of sync with it.
- **Phase linkage grammar** — the phase is the unit of linkage: `- Builds:` and `- Depends:` are
  checked per phase, and `- Depends:` is rejected if it crosses a docs tree — cross-service coupling
  must go through a root epic, or the other tree ships blind to being depended on.

## Glossary

- **Governed doc** — a doc type this module classifies and lints (todo, decision, handover, module
  note); free-form types (architecture docs, `product/`, `business/`, `design/`, `brand/`) are never
  linted.
- **Living vs record** — see the section below; a living file is overwritten in place, a record is
  appended and never mutated.

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

The classifier encodes the standard's core distinction: a LIVING file is overwritten in place — the
module notes under `docs/visuals/modules/` and `handover.md` — while a RECORD is frozen: a decision
or a todo keeps its reasoning as written and takes only a stamp. An accepted ADR is immutable, and a
later one amends or supersedes it by stamping BOTH ends. There is no index carrying that state, by
design: an index is a second copy to drift.

The living half of this sentence used to name `features`, `conventions` and `memory`. Those files no
longer exist (ADR 0193).
