# 0011 — kill derived-doc generation; structure is queried, never written
Status: Accepted
- Date: 2026-07-19
- Promoted: docs/features.md ("Integrity Blueprint — `conducks status --blueprint`" — stdout-only, never persisted); docs/architecture/modules/domain/analysis/docs-grammar/MODULE.md

## Context
conducks generated a family of static structural docs — `ARCHITECTURE.md` (context-gen, auto-written
after EVERY analyze), `BLUEPRINT.md` + `llms.txt` (blueprint; llms.txt was a near-duplicate),
`.conducks/structural_mirror.md` (visualize) — and the conducks-docs standard called these "DERIVED"
files. Reviewing the real output on two codebases (TargetedCV, sofie): the docs were low-signal and
self-contradictory. Writing structure to a static file is exactly the staleness conducks exists to
kill — the moment code changes, the file is wrong. The value of conducks is the queryable graph
(`.conducks/*`) plus the LIVE commands (audit, impact, trace, coverage, query, cycles/self-imports),
which answer structural questions on demand and were empirically verified false-positive-free.
`visualize` was also redundant with `mirror` (the live UI) and `impact`/`trace`.

## Decision
Remove all static structural-doc generation. Deleted commands `context-gen`, `blueprint`,
`visualize` and their generators (`context-generator.ts`, `blueprint-generator.ts`, `visualize.ts`);
removed the auto-regeneration of `ARCHITECTURE.md` after analyze; dropped the `manifest`/`contextFile`
paths from the CLI `status --manifest` and the MCP synapse tool; stopped scaffolding a derived
`architecture.md` stub in `bootstrap-docs`. Structure is now ONLY queried live from the graph.

The conducks-docs standard is re-scoped: docs are **AUTHORED intent only** — features, conventions,
memory, decisions, todos. There is no "DERIVED file" class. Want structure? Run a command against the
graph. (`docs-grammar` keeps a tolerant `derived`/`prose` classifier so a repo's pre-existing
`architecture.md` still lints, but nothing generates one.)

## Consequences
conducks shrinks to what earns its keep: an engine you query, not a doc factory. No more stray
`ARCHITECTURE.md` at every analyze; no BLUEPRINT/llms.txt duplication; no 1400-node visualize
hairball. Kept: `.conducks` graph, all live query commands, `mirror` (UI), authored docs +
`docs-lint`/`docs-status` over them. Build green, 43/43 tests. Follow-up: delete the already-generated
`architecture.md`/`BLUEPRINT.md`/`llms.txt` from TargetedCV + sofie, and rewrite the conducks-docs
skill to authored-only.
