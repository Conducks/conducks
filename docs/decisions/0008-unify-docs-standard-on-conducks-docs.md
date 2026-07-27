# 0008 — unify the docs standard on conducks-docs; retire docs-rules
Status: Accepted
- Enforced by: tests/unit/domain/analysis/docs-grammar.test.ts
- Date: 2026-07-18

## Context
Two documentation-standard skills coexisted globally: `docs-rules` (the universal, tooling-free
standard — 431 lines) and `conducks-docs` (the derive-vs-author evolution for repos running
conducks — 243 lines). Their spines overlapped (living-vs-record, ADR format, todo numbering,
monorepo layout were restated in both) — the exact duplication-drift failure conducks exists to
kill. But neither was a superset: `conducks-docs` dropped the full folder set
(`product/ business/ brand/ design/ process/ archive/`), `handover.md`, the ADR supersede-vs-amend
discipline, todo epic/slice mechanics, link topology, and edge cases — everything that lets the
standard apply to a repo *before* conducks can read it.

## Decision
Make `conducks-docs` the single standard — the complete evolution of `docs-rules` — and delete
`docs-rules`. Gated on two conditions, both met:
1. **Skill complete.** `conducks-docs` folds in every `docs-rules` capability (full folder set,
   handover, ADR discipline, todo epic/slice, linking, node-anchored intent, specs-run-the-other-
   way, edge cases) plus a stated *format-first* principle: author the format now, conducks reads
   it when it runs.
2. **Tool reads the whole format.** `docs-grammar.ts` classifies every file/folder the standard
   defines — added a `handover` governed type (title + Status lint) and a `prose` type for the
   free-form category folders + README, so no part of the standard reads as `unknown`. `unknown`
   is now reserved for genuinely-misplaced files (the move-me signal).

Repointed the two skills that referenced docs-rules (`arch-audit`, `multi-agent-protocol`) to
`conducks-docs`; removed a stale byte-identical `docs-rules` copy left inside the conducks-docs
skill folder (`SKILL.md.base`).

## Consequences
One docs standard, one source — the spine is stated once, not twice, so it cannot drift. Repos not
yet running conducks still have a complete, hand-authorable standard (format-first). `docs-lint`
stays clean on conducks's own docs (19 governed files incl. handover); the grammar change is locked
by `tests/unit/domain/analysis/docs-grammar.test.ts`. Vault references (`VAULT.md`, `Workshop.md`)
point at a phantom `docs_rules.md` path and are Said's to update — flagged, not touched. Follow-up:
conducks's own five flat root docs (`business_plan.md`, `creative_brief.md`, `product_plan.md`,
`styling.md`, `implementation.md`) now read `unknown` — they belong in the category folders.
