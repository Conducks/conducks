# Handover — 2026-09-19
Status: current

## Where it stands
Gates green: **2,521 tests / 326 suites**, build clean, `docs-lint` 239 docs, `visuals-lint` 296
anchors across 81 pages, drift clean. `docs-lint` is the SINGLE docs gate — it runs the note grammar
and invokes `visuals-lint` itself.

**todo79 closed.** `architecture.md`, `features.md`, `conventions.md` and `memory.md` are deleted
(ADR 0193, 0194, 0195) — 3,366 lines dissolved into the module notes, with a coverage audit proving
every fact had a home before anything was removed. A module note is now grammar-linted, which turned
1,864 lines of unchecked prose into ~300 anchored claims. The `CONDUCKS-N` ids are retired; ADR 0195
carries the translation table and `tests/architecture/retired-convention-ids.test.ts` holds the line.

**The skills were rewritten to their own §9.** `conducks-docs` split into a 167-line router plus six
references (`grammar`, `notes`, `decisions`, `todos`, `trees`, `visuals-policy`) — writing a todo now
loads ~431 lines instead of 1,172. Across all 19 skill files, ADR citations went 58 → 2 and no
reader-facing prohibition remains: a rule states what to do and names its cost in the same sentence,
because an internal record number is unopenable in the project a skill ships to.

**`docs/` holds only what the standard defines** plus the soft folders and `legacy/`. `deep_clean.md`
was a finished research log and is deleted; the two facts it still owned went to
`core/parsing/reflector.md` and `core/git.md`. `AGENT_RULES.md` moved to `.claude/`, rewritten with
its stale numbers re-measured.

**ADR 0196** — `impact` and `trace` now share one `EDGE_DISTANCE` table. The visible symptom was a 5x
magnitude gap; the actual defect was `ALIASES` missing from `trace`'s table, so a barrel re-export
cost the same as a direct call.

## Next, in order
1. **`conducks features` reports 31/31 notes with no `## Features` body.** The section exists
   everywhere and is almost always `none`. That count is honest and it is the largest remaining gap in
   the corpus — the feature tree is not yet worth reading.
2. **todo77 has four open decisions**, not work: whether the layer contract is per-project, whether
   `doctor` exits non-zero on a failed check, reconciling `drift` STABLE against `diff`'s 13,103
   changes, and what `doctor` and `list` each count as a vault.
3. **`todo78` is `Status: done` with 0 open tasks but still sits in `todos/`.** Promote anything it
   still owns, then move it to `completed/`. The board warns about it every run.
4. **`brand/` is not named in the standard's soft list** (`product/ business/ design/`). One word, or
   it keeps reading as an orphan at `docs/` root.
5. **todo16 — npm publish.** Owner's to run: irreversible, spends the package name.

## What the checks did NOT cover
Three glossary collisions remain and are correct: `anchor`, `Pulse` and `Wave` are each two unrelated
things sharing a word, qualified in place so a reader hitting either is warned. `conducks glossary`
will report them forever, which is the honest state rather than an exemption.

The completeness bar ADR 0193 states — from the notes alone a reader can describe the system without
opening the code — is UNSCORED by decision. Nothing checks it; ADR 0194 says why.

Nothing in this session is committed. The working tree also carries unrelated in-flight work (the
mirror refactor, benchmark scripts) that predates it.
