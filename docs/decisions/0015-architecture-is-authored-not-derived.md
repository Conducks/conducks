# 0015 — Architecture docs are AUTHORED, not derived
Status: Accepted
- Enforced by: tests/unit/domain/docs/docs-grammar.test.ts ("classifies architecture as AUTHORED (file OR folder OR MODULE.md), not derived — ADR 0015")
- Amends: 0009 (which classified architecture as the "derived" tier)
- Related: 0011 (killed auto-generated derived docs — still correct)
- Date: 2026-07-19
- Promoted: docs/architecture/README.md (header); docs/architecture/modules/domain/analysis/docs-grammar/MODULE.md ("Governed vs free-form is a deliberate two-tier design")

## Context
ADR 0009 classified `architecture.md` and the `architecture/` folder as the "derived" tier, and
`docs-grammar.ts` returned `type = "derived"` for them. ADR 0011 then killed derived-doc *generation*.
The combined effect was that architecture docs were treated as machine-generated wiring and effectively
banned — the conducks-docs standard read "No architecture.md anywhere — that's structure. Query it."

That conflated two different things. The *wiring* of a module (which function calls which, the import
graph, cycles) IS derivable and must be queried (`audit`/`impact`/`trace`), never written. But the
*intent* of a module — why it exists, what layer it sits in, where its boundaries are, what design was
deliberately deferred — is NOT derivable from code. It is authored intent, the exact thing docs are
for. subject-c's `docs/architecture/**/MODULE.md` are the model: hand-written module narratives holding
responsibility, rationale, rejected alternatives, and not-built design debt — none of which any graph
query can produce.

## Decision
Split the two. Architecture docs are **authored**, never auto-generated:
- `docs-grammar.ts`: `architecture.md`, an `architecture/` folder, and per-module `MODULE.md` now infer
  `type = "architecture"` — an AUTHORED, free-form type (not in `GOVERNED`, so never skeleton-linted).
  Only `map.md` / `drift.md` remain `"derived"` (pure wiring — query, don't write).
- conducks-docs standard: architecture is a living authored category alongside features/conventions/
  memory. The rule is "architecture is authored, never generated" — a human writes `MODULE.md`; no
  tool emits it; wiring stays out of it. The auto-generation ban (ADR 0011) is unchanged.
- The canonical standard now lives IN the repo (`src/resources/skills/conducks-docs.md`) as the source
  of truth; the global `~/.claude/skills/conducks-docs/SKILL.md` is synced from it.

Rejected: (a) keep architecture banned — loses authored module intent that code can't carry. (b) make
architecture a GOVERNED skeleton — module narratives are legitimately free-form (see subject-c), a rigid
skeleton would fight real content.

## Consequences
Authored architecture docs are valid and unflagged; `audit`/`impact`/`trace` are untouched and remain
the only source of wiring. Teams can explain a module's shape without a stale generated file. The docs
standard's canonical home is the codebase, not a personal skill copy. `docs-lint` stays clean (27
governed). `map.md`/`drift.md` still correctly flagged as derived-not-to-be-authored.
