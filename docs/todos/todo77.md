# todo77 — prove each Tier A command by breaking the subject
Status: doing
- Builds: 0160
- Acceptance: every phase below records L1, L2 and L3 per subject with the counts beside each other — found/planted for L2, flagged/planted for L3 — and names the cells of the shape x language matrix it covered and the ones it did not.

Order is ADR 0160's: fixes flow forward, so a phase is never reopened by a later one. Each level
starts from a clean `git status` on all three subjects, and every injection is reverted before the
next level runs.

Subjects, at their 2026-08-27 pull: `sofie` (497 ts / 69 tsx / 9 py), `scraper` (235 py / 27 js /
6 mjs), `orchestrator` (npm-workspaces monorepo, 537 ts / 225 tsx / 28 mjs). The Python-monorepo cell
has no subject and stays open.

**A subject refresh is part of the method** (ADR 0167). Pulling all three to latest surfaced four
defects that 326 scored verdicts, ten mutation-proved mechanisms and two exact oracles had all
missed — a frozen subject cannot surface a shape it does not contain.

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
| L1 precision | 326 verdicts across 3 subjects | **0 false positives** |
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

### The sixth defect — a name appearing stood in for a reference

The last two misses, one per language, were both marked used by evidence that a NAME appeared rather
than that the binding was referenced. A method call resolves to `<file>::<class>.<method>`, and the
index tokenised the whole tail — so a call's RECEIVER marked the imported class used. And the index
tokenised raw ARGUMENT TEXT, so an object literal's KEY (`canonicalKind:`) masked an import
(`CanonicalKind`) four lines above it.

ADR 0166 drops the receiver segment for `CALLS` edges only — applied to every edge type it produced a
false positive on orchestrator, where `ExpertService` is imported aliased and used as a superclass —
and retires raw argument text, which the grammar's own arguments capture had already superseded.
Verified redundant rather than assumed: removing the grammar capture fails three assertions, removing
the raw-token path fails none.

That exposed one genuinely uncaptured read — `() => X`, an arrow whose body IS the identifier — now
captured.

### Where prune ended up

| oracle | at the start of this phase | now |
|---|---|---|
| TypeScript, vs `tsc --noUnusedLocals` | 26 missed / 0 extra | **0 missed / 0 extra** |
| Python, vs `ast` | 4 missed / 0 extra | **0 missed / 0 extra** |

Both stale-import oracles are exact, stable across repeated runs. Precision never left zero at any
point in the phase.

The exports oracle reports 12 missed / 0 extra, and 11 of those are referenced only inside their own
file — which `UNUSED_EXPORT` counts as consumption, since it claims "never consumed by other
modules". Scoring them as misses would grade a stricter claim than the tool makes. The twelfth is a
### Every Python verdict now has an oracle too

TypeScript had an independent checker for every verdict prune makes; Python had one for exactly one
of them — `oracle-python.mjs` scores `STALE_IMPORT` and nothing else. So every Python ORPHAN rested
on hand-reading, which is the method that missed all eight namespace false positives.

Wrong place for the gap: **three of the four defects above were Python**, and the largest was an
ORPHAN defect worth eight false findings. It was caught by refreshing a subject, not by a check.

`oracle-python-dead.mjs` (ADR 0169) scores `ORPHAN` and `ONLY_IMPORTED` against Python's own `ast`:
scraper **1,441 definitions walked, 0 missed, 0 extra**; sofie's Python 75, 0 and 0.

It is proved by catching the defect it was built for — reverting the module binding makes it report
8 EXTRA and exit non-zero, naming each symbol with its reference count. An oracle that has never
caught anything is a claim, not an instrument.

genuine recall gap of one symbol.

### The seventh defect — fresh code, four gaps, three of them Python

All three subjects were pulled to latest after the numbers above were reached. Four defects appeared
on code conducks had never seen, and three were in Python — the language whose value-position set was
written separately and never received ADR 0165's work.

| shape | cost |
|---|---|
| keyword argument in a class header — `class X(Base, domain=DOMAIN)` | 1 false stale import, sofie |
| bare assignment — `_X = X` | part of 5 on scraper |
| comparison operand — `status in TIERS` | part of the same 5 |
| **a module imported from its package** — `from pkg import page_source` | **8 false ORPHANs**, scraper |

The fourth is ADR 0161's namespace import, in Python: the branch that recognised
`from pkg import submodule` pushed an edge and bound nothing, so the call resolved against the
PACKAGE and dangled. Fixed by reusing the same machinery.

scraper 57 → 49, sofie 173 → 172, orchestrator 245 and **unchanged by any fix**. Both oracles stayed
exact throughout, now against subjects roughly 40% larger.

**The module binding is proved on the subject, not by a fixture.** The test was written twice,
through `prune` and through `impact`, and passed with the mechanism mutated away both times — in a
fixture that small the intra-linker rebinds the dangling name. Deleted per Rule 10; the proof is the
subject measurement, which returns eight false ORPHANs when the binding is removed.

### All three re-scored on refreshed code

| subject | verdicts scored | false positives | note |
|---|---|---|---|
| scraper | 43 | 0 | 4 defects fixed to get there |
| sofie | 167 | 0 | 1 defect fixed |
| orchestrator | 183 | 0 | **nothing to fix** |

**393 verdicts, 0 false positives.** Orchestrator — pulled last, and the only monorepo — produced no
new defect at all. Its whole `UNUSED_EXPORT` set was re-checked against the precise claim ("no OTHER
module imports it") rather than by name, which is what a monorepo demands: `app/` and `admin/` each
hold their own `constants/auth.ts`, and every `@/lib/constants/...` import resolves workspace-locally,
so the duplicate in the other workspace genuinely has no consumer. Eleven findings a name-based check
called contradicted are correct.

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
