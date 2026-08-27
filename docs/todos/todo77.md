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
| L1 precision | 325 verdicts across 3 subjects | **0 false positives** |
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

### The fourth defect — an import through a door landed on the door

After 0163, 22 TS misses remained. **Three hypotheses were tested against the oracle and all three
were wrong** — the type-only shortcut, the kind gate, and the aliased-spelling check each moved the
number by zero. The third was kept until mutation-tested, did not bite, and instrumenting the line it
was meant to protect showed the resolved target tail already carried the original spelling; it was
removed as dead code.

One instrumented run then named the cause: an import routed through a barrel resolves to the
barrel's re-export node, whose kind is `binding`, and `binding` was not a prunable kind. **No import
reached through a door could ever be judged stale.** ADR 0164 follows the alias to the declaration,
and splits the two barrel questions — an `index.ts` is exempt when asking "is this SYMBOL dead" and
NOT exempt when asking "is this IMPORT dead".

| oracle | at the start of this phase | now |
|---|---|---|
| TypeScript, vs `tsc` | 26 missed / 0 extra | **4 missed / 0 extra** |
| Python, vs `ast` | 4 missed / 0 extra | **1 missed / 0 extra** |

### The fifth defect — a bare value read produced no edge

The four remaining misses were `const`-kind imports, excluded since todo63 because *a plain value
read produces no relationship at all*. That premise was checked rather than accepted, and it was
partly stale: `for (const x of TABLE)` had since been captured, `return x` and `const y = x` had not.

ADR 0165 captures them, plus two more that only appeared once `variable` was allowed — each found by
a measured false finding, not by reading:

| position | cost of omitting it |
|---|---|
| class field initialiser — `public readonly queryScm = GO_QUERIES` | **13** false findings, one per language pack |
| template substitution — `${SITE_URL}` | **6** false findings on orchestrator, one per page file |

The class-field pattern is TS/TSX-only — JavaScript spells it `field_definition`, and putting it in
the shared block broke the TypeScript pack outright (ADR 0089). The heritage canary was the only
thing that failed loudly; bisecting five patterns named it.

### Where prune ended up

| oracle | at the start of this phase | now |
|---|---|---|
| TypeScript, vs `tsc --noUnusedLocals` | 26 missed / 0 extra | **1 missed / 0 extra** |
| Python, vs `ast` | 4 missed / 0 extra | **1 missed / 0 extra** |
| exports, vs `tsc` | 12 missed / 0 extra | **10 missed / 0 extra** |

Precision never left zero at any point.

### The one that remains, named

`CanonicalKind`, imported at `reflector.ts:17` and never referenced. The used-names index is
case-folded and name-based, and `canonicalKind` is a PROPERTY KEY at four lines in the same file, so
the key masks the import. Closing it means keying usage by resolved edge identity rather than by
token — a different index with its own precision risk, not attempted here.

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
