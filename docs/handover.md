# Handover — 2026-07-24
Status: current

## Where it stands
- **conducks-docs standard hardened** (`src/resources/skills/conducks-docs.md`, 265 lines). Seven new
  rules, the load-bearing one being **promote-on-close**: a record freezes the *why*, but what is true
  NOW must move to a living file the same turn — nothing in `completed/`/`legacy/` counts as context.
  Also: handover rewritten every session; `docs/README.md` and `decisions/README.md` now governed;
  memory-vs-conventions tiebreak; `## Tunables` in features.md; one-docs-root; generated-output-untracked.
  `handover` moved Record→Living (it is overwritten, never superseded).
- **Skill lives in 3 places, all in parity**: `src/resources/skills/` (source) → `build/src/resources/skills/`
  → `~/.claude/skills/`. The middle one matters: the installer resolves `SKILLS_DIR` relative to its
  own *compiled* file, so `conducks setup` ships the build copy — a stale one silently reinstalls the
  old skill over the new. Refresh with `npm run build` (or a direct `cp`) after editing the source.
- **Deleted `ARCHITECTURE.md`, `BLUEPRINT.md`, `llms.txt`** from the repo root — 16,551 lines, staged
  not committed. Orphaned pre-ADR-0011 artifacts: nothing in `src/` writes them, `status --blueprint`
  prints to stdout only, and `generateBlueprint()` (`conducks-core.ts:356`) is a 4-line stub with zero
  callers. `BLUEPRINT.md` and `llms.txt` were byte-identical.
- **features.md was advertising capabilities that do not exist** — "Static Structural Diagram" (no
  mermaid/graphviz anywhere in `src`) and "LLM Context Generation" (wrote a summary to the project
  root — the exact thing ADR 0011 banned). Both removed, replaced by one honest entry for
  `conducks status --blueprint`.
- **Docs truth pass** — ADR index no longer double-lists 0003/0009/0010/0016 (amendments are inline on
  a single entry now); `memory.md` lost 4 entries that duplicated CONDUCKS-4/11/12 or were already
  resolved, their surviving detail promoted into those conventions; `docs/README.md` rewritten as a map
  (state + read-order + table); todo02 `doing`→`todo` (0 of 18 done), todo09 `doing`→`blocked` (only
  externally-blocked items remain). Superseded parent-level `features.md` moved to `archive/`.

## Next, in order
1. **todo11 — inheritance edges.** The graph has ZERO EXTENDS/IMPLEMENTS edges (see `memory.md`), so
   `implements X` registers no usage and STALE_IMPORT floods. Fix heritage capture first, then prune.
2. **todo07 — workspace rollout.** Run conducks on the drifting repos. Nothing started.
3. **`todos/completed/` is 1,976 lines (37% of all docs)** and still holds live facts. Needs a
   promote-then-compress pass under the new rule: promote survivors into features/conventions/memory,
   then cut each file to a ≤10-line stub. Until then, do not read those files as context.
4. `features.md` names its command for only ~5 of 51 capabilities. The rest need a *verified*
   feature→command mapping — a guessed command name is worse than none. `progress.md` (241 lines,
   unbounded) still needs a cap rule.
5. Left alone by decision: the `conducks-governance` skill still instructs `conducks_blueprint_gen()`
   → BLUEPRINT.md — a tool that does not exist, writing a file that no longer exists.
