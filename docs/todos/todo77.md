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

Closed. The hypothesis was that `prune` — ~40 findings hand-checked across rounds 5 and 6 with zero
false positives — was strong enough that finding nothing here would indict the METHOD rather than the
tool. **The hypothesis was wrong twice**, and both defects were invisible to sampling.

- [x] L1 sofie — 135 verdicts scored, 13 code-hit suspects, every one a name collision or a string literal. 0 false positives
- [x] L1 scraper — 17 verdicts scored, 3 suspects, all comment/string/docstring. 0 false positives, and the 7 ABC base classes still read as live
- [x] L1 orchestrator — 175 verdicts scored, 61 suspects, 8 confirmed FALSE POSITIVES, all namespace imports. Fixed by 0161; 239 → 230, nothing added. Re-scored: 166 verdicts, 9 suspects gone, 0 new
- [x] L2 scraper — 4 planted, 4 found: an orphan function, an orphan class, and an unused first-party import now reported as both ONLY_IMPORTED and STALE_IMPORT
- [x] L2 sofie — 3 planted, 3 found: an orphan function, an unused export reported as ORPHAN (a stronger claim, and true), and a single-binding unused import now reported STALE_IMPORT
- [x] L2 orchestrator — 3 planted one per workspace, 3 found. A monorepo miss cannot hide behind a single-package pass
- [x] L3 scraper — 4 planted, 0 flagged: a test-only consumer, a name re-exported through `__init__.py`, a `__main__` entry point, an ABC override called through its base
- [x] L3 sofie — 3 planted, 0 flagged: consumed only through a barrel, consumed only from a test, and a method reached only by interface dispatch
- [x] L3 orchestrator — 1 planted, 0 flagged: an export consumed only by a SIBLING workspace, the monorepo-specific false positive
- [x] an unused import LAUNDERS a dead symbol — fixed by 0162 as `ONLY_IMPORTED`, a question rather than a verdict
- [x] decide whether an unused stdlib whole-module import is in scope for STALE_IMPORT — it is NOT: only a resolved in-project named import becomes a candidate, which `findStaleImports` states in its own header

### The three levels, totalled

| level | planted / scored | result |
|---|---|---|
| L1 precision | 318 verdicts across 3 subjects | **0 false positives** after two fixes |
| L2 recall | 10 planted | **10 found** |
| L3 counter | 8 planted | **0 flagged** |

`UNIMPORTED_MODULE` is excluded from L1 throughout — 73 of the findings. `prune` calls those
questions rather than verdicts, so scoring them would grade a stricter claim than the tool makes.

The L1 checker was instrumented before being believed: a known-live symbol returned 23 hits, a
garbage name 0, a question was skipped. 83 findings had a hit and were read by hand.

### The two defects, and why sampling missed both

**Namespace imports bound nothing** (ADR 0161). 8 false positives on orchestrator, 0 on the other two
— a barrel that namespace-imports its siblings is idiomatic in a monorepo `core` package and appears
in neither single-repo subject. Rounds 5 and 6 checked ~40 of ~400 findings and the sample missed all
8.

**An unused import laundered the symbol behind it** (ADR 0162). No sample could have found this one:
it is not a wrong finding, it is a MISSING finding, and only planting the defect makes an absence
visible. Adding one dead import took scraper from 23 findings to 22.

### The third defect, and how the known miss was closed

Both L2 misses were the same shape — a single-binding unused import — and the import-site
calibration guard was why, because "nothing in this statement is used" is true by construction when
the statement brings in one name.

The guard looked immovable: removing it was measured at 77 false findings on Python in 2026-08-15,
and still 54 today. **Classifying the 54 is what moved it** — 54 of 56 were in an `__init__.py`, one
shape accounting for 96% of the damage, and the same shape ADR 0162 had already named for a different
rule. ADR 0163 excludes barrels and retires the guard.

| oracle | MISSED before → after | EXTRA before → after |
|---|---|---|
| TypeScript, vs `tsc` | 26 → 23 | 0 → 0 |
| Python, vs `ast` | 4 → 1 | 0 → 0 |

Better on both axes in both languages. The lesson is the record's title: a blanket guard tolerating
an unknown shape cost every single-binding import in two languages, and naming the actual shape cost
nothing.

### What prune still misses, with the reason

23 on TypeScript, 1 on Python, measured against the compilers. Two named causes, both in the parser
layer rather than in `dead-code.ts`: **type imports**, which `isTypeOnly` treats as used because
TypeScript emits no `TYPE_REFERENCE` edges (ADR 0016), and **`const`-kind value imports**, which
`PRUNABLE_BINDING_KINDS` excludes deliberately. Neither is closable by this analyzer alone.

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
