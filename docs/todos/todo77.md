# todo77 — prove each Tier A command by breaking the subject
Status: doing
- Builds: 0160
- Acceptance: every phase below records L1, L2 and L3 per subject with the counts beside each other — found/planted for L2, flagged/planted for L3 — and names the cells of the shape x language matrix it covered and the ones it did not.

Order is ADR 0160's: fixes flow forward, so a phase is never reopened by a later one. Each level
starts from a clean `git status` on all three subjects, and every injection is reverted before the
next level runs.

Subjects: `sofie` (single repo, 437 ts / 67 tsx), `scraper` (single repo, 167 py), `orchestrator`
(npm-workspaces monorepo, 455 ts / 198 tsx). The Python-monorepo cell has no subject and stays open.

## Phase 1 — prune

Hypothesis: `prune` is the strongest Tier A command — ~40 findings hand-checked across rounds 5 and
6 with zero false positives — so if this method finds nothing here, the METHOD is weak, not the tool.
That is why it goes first rather than one of the thin four.

**The hypothesis was wrong, and that is the finding.** The method found a false-positive class the
two previous rounds had missed, and a second defect that no round had looked for at all. Both are
below, with the numbers beside them.

- [x] L1 sofie — 135 verdicts scored mechanically, 13 code-hit suspects, every one a name collision or a string literal. 0 false positives
- [x] L1 scraper — 17 verdicts scored, 3 suspects, all comment/string/docstring. 0 false positives, and the 7 ABC base classes still read as live
- [x] L1 orchestrator — 175 verdicts scored, 61 suspects, 8 confirmed FALSE POSITIVES — every one a namespace-imported symbol. Fixed by 0161; re-run 239 → 230, nothing added
- [x] L2 scraper — 4 planted, 3 found: an orphan function, an orphan class, an unused first-party import. The 4th miss is recorded as a defect below
- [x] L3 scraper — 4 planted, 0 flagged: a test-only consumer, a name re-exported through `__init__.py`, a `__main__` entry point, an ABC override called through its base
- [ ] L2 sofie — plant 3: a function nothing calls, an export imported nowhere, an import of a symbol that no longer exists. `prune` must name all 3
- [ ] L2 orchestrator — plant the same 3, one per workspace, so a monorepo miss cannot hide behind a single-package pass
- [ ] L3 sofie — plant 4 it must NOT flag: an export consumed only through a barrel re-export, a symbol used only from a test, a registered entry point, a method overriding an interface
- [ ] L3 orchestrator — plant 4, including an export consumed only by a SIBLING workspace, which is the monorepo-specific false positive
- [ ] an unused import LAUNDERS a dead symbol — importing dead code makes it invisible, so adding a defect LOWERS the finding count
- [ ] decide whether an unused stdlib whole-module import is in scope for STALE_IMPORT, and say so wherever the claim is stated

### What L1 measured, and what it did not

327 verdicts were scored across the three subjects by grepping each finding's own claim — a symbol
outside its defining file for `ORPHAN` and `UNUSED_EXPORT`, a non-import line inside it for
`STALE_IMPORT`. The checker was instrumented first: a known-live symbol returned 23 hits, a garbage
name 0, and a `question` was skipped. **83 findings had a hit and were read by hand.**

`UNIMPORTED_MODULE` is excluded throughout — 73 of the 400 findings. `prune` itself calls those
questions rather than verdicts, so scoring them as verdicts would be scoring a stricter claim than
the tool makes.

### The laundering defect, with its repro

Measured on scraper, cold analyze each time, nothing else changed:

| state | findings | `get_data_dir` |
|---|---|---|
| baseline | 23 | `ORPHAN` |
| one unused `from foundation.paths import get_data_dir` added | **22** | **not flagged at all** |

The import is not reported `STALE_IMPORT` either, so the symbol leaves both categories at once. An
unused import of a live symbol IS caught — `FeatureSet` from `base_interfaces`, planted the same way,
was reported — so the capability works; it is the combination of a dead symbol and a dead import that
falls through the gap between the two checks.

This is the shape a real repository produces during a refactor: the last caller is deleted, the import
is left behind, and the symbol stops being reported the day it actually died.

## Phase 2 — trace

- [ ] L1 on all three subjects
- [ ] L2 — plant call paths `trace` must walk
- [ ] L3 — plant paths it must not invent

## Phase 3 — context

- [ ] L1 on all three subjects
- [ ] L2 — plant neighbours it must return
- [ ] L3 — plant non-neighbours it must not

## Phase 4 — entry

- [ ] L1 on all three subjects
- [ ] L2 — plant real entry points it must find
- [ ] L3 — plant near-misses it must not call entry points

## Phase 5 — flows

- [ ] L1 on all three subjects
- [ ] L2 — plant a flow it must name
- [ ] L3 — plant a non-flow it must not

## Phase 6 — audit

- [ ] L1 on all three subjects
- [ ] L2 — plant a cycle, a self-import and a god object
- [ ] L3 — plant legal shapes that resemble each, including mutual recursion with a clear entry order

## Phase 7 — guard

- [ ] L1 on all three subjects
- [ ] L2 — plant a layer violation it must block
- [ ] L3 — plant a legal edge it must pass

## Phase 8 — advise

- [ ] L1 on all three subjects
- [ ] L2 — plant a condition it must advise on
- [ ] L3 — plant a healthy shape it must stay silent about

## Phase 9 — diff

- [ ] L1 on all three subjects
- [ ] L2 — make structural changes it must report
- [ ] L3 — make non-structural changes it must not

## Phase 10 — drift

- [ ] L1 on all three subjects
- [ ] L2 — produce decay across two pulses it must detect
- [ ] L3 — produce a stable pair it must call stable

## Phase 11 — doctor

- [ ] L1 on all three subjects
- [ ] L2 — break the environment, not the source: a stale vault, an absent native binding
- [ ] L3 — a healthy environment it must not warn about

## Phase 12 — list

- [ ] L1 on all three subjects
- [ ] L2 — break the registry, not the source: a linked project whose path is gone
- [ ] L3 — a correct registry it must report unchanged
