# 0001 — Derive structure, author intent
Status: Accepted
- Enforced by: tests/unit/domain/docs/docs-grammar.test.ts ("keeps map/drift/progress as derived — query it, never author it")
- Date: 2026-07-17

## Context
Conducks docs previously mixed two kinds of facts inside the same files: things a machine
could compute from the source (call graphs, file trees, dependency direction) and things only
a human could know (why a module exists, why a rule was chosen). Computable facts change on
every commit, so hand-writing them rots the docs almost immediately — `docs/architecture.md`
and `docs/features.md` already existed as separate files (`updated the docs and the rules for
the docs`, commit `21a86d0`), but nothing enforced which kind of fact belonged in which file.

## Decision
Split every doc fact by one test: could conducks compute this from the code? If yes, it is
DERIVED — conducks generates it (`architecture.md`, `map.md`, `drift.md`) and humans never
hand-edit it. If no — a human decided it for a reason the code cannot record — it is AUTHORED
(`features.md`, `conventions.md`, `memory.md`, `decisions/`, `todos/`). `docs/architecture.md`
stays wiring-only ("how it's connected"); `docs/features.md` stays intent-only ("what it's for
and why"). The two are never allowed to overlap or restate each other.

## Consequences
Architecture-shaped docs can be regenerated every pulse without fear of clobbering human intent,
because intent never lives there. Humans only write what a machine cannot infer, which keeps the
authored surface small and slow-changing. The cost: every new doc must be sorted into DERIVED or
AUTHORED before it is written, and any file that mixes the two (as early conducks docs did) needs
to be split before it can be trusted by the `conducks docs-lint` grammar.
