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
### L2 and L3 re-run on the refreshed subjects

L1 was re-scored after the pull; the planted passes were not, and they had run against code roughly
40% smaller. Re-run on the current subjects, with counter-cases added for every mechanism fixed since:

| subject | L2 planted / found | L3 planted / flagged |
|---|---|---|
| scraper | 3 / **3** | 6 / **0** |
| sofie | 3 / **3** | 2 / **0** |
| orchestrator | 3 / **3** | 1 / **0** |

The scraper L3 set is the one that matters, because it plants the four shapes fixed on 2026-08-27 as
counter-cases in real code: a function reached only as `paths.l3_module_called(...)` through a module
import, a constant read only as a class-header keyword argument, one read only through
`_X = X`, and one read only as `x in TIERS`. None was flagged.

**No new defect.** The refreshed code answered the planted passes cleanly — the four defects the
refresh found were all found by L1, not by planting.

One scoring correction: sofie's six read-position counter-cases came back `UNUSED_EXPORT`, which is
correct and not a miss — they are exported from `app.ts` and consumed only inside it, which is what
that verdict claims. The L3 assertion is that the read registers as a REFERENCE, and it did: had it
not, they would have been `ORPHAN`.

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

### The prune benchmark — 10 scenarios, 10 passing

Six oracles and three levels still left prune called finished three times and wrong twice, because an
oracle scores what a subject CONTAINS and cannot ask for a shape that is absent. ADR 0175 adds ten
fixtures with their ground truth written down, each one a defect this repo shipped or a rule it holds.

**10 of 10 pass, and the suite is proved by mutation, not by passing** — removing the barrel rule
fails 06, the spread/subscript captures fail 08, ONLY_IMPORTED fails 04, restoring the calibration
guard fails 03, the TS namespace capture fails 07.

Three scenarios were wrong before prune was: the first run scored 7/10 and every failure was the
fixture. Two more passed with the defect restored and were strengthened. Scenario 07's Python half is
asserted here but proved on the subject, and says so.

`npm run bench:prune`.

### Which project each instrument actually ran on

Asked directly, the answer was uneven and unwritten: **`oracle-tsc.mjs`, the strongest instrument,
had only ever run against conducks itself.** Pointing it at the two TypeScript subjects found three
defects in the INSTRUMENT (ADR 0176): `npx tsc` resolving a joke package on sofie, `EXTRA` blaming
prune for files outside the compiler's program, and a liveness probe that imported a conducks-only
path into a directory not every project compiles.

| target | imports vs tsc | exports vs tsc | python | python dead | trace |
|---|---|---|---|---|---|
| conducks | ✓ 0/0 | ✓ | — | — | — |
| sofie | ✓ 0/0 | ✓ | — | ✓ 0/0 | — |
| orchestrator/admin | ✓ 0/0 | — | — | — | — |
| orchestrator/app | ✓ 0/0, after `npm ci` at the monorepo root | ✓ | — | — | — |
| scraper | — | — | ✓ 0/0 | ✓ 0/0 | ✓ |

### Phase 1 closes

| check | result |
|---|---|
| L1 precision | 393 verdicts, 0 false positives |
| L2 recall | 9 planted, 9 found |
| L3 counter-cases | 9 planted, 0 flagged |
| oracles | TS imports 0/0 · Python imports 0/0 · Python dead 0/0 · exports 12 missed / 0 extra |
| benchmark | 10 / 10 |

### The two empty cells are closed, and one was hiding a defect

A JavaScript-primary codebase and a Python monorepo had no subject, and both were filed as
acquisition problems. Half right: no real subject exists, but the benchmark can BUILD the shape —
and scenario 11 failed on its first honest run.

A constant read only by a JS class field (`held = FIELD`) was reported `STALE_IMPORT`. TypeScript
spells that node `public_field_definition` and JavaScript spells it `field_definition`; ADR 0165 had
to put the TS spelling in the TS/TSX-only block because naming a node a grammar lacks invalidates the
whole query — **and the JS spelling was then captured nowhere.** Fixed (ADR 0178); mutating it away
fails scenario 11 and nothing else.

Scenario 12 passed first time: Python cross-package imports, the `__all__` barrel and the
module-qualified call all resolve, so the monorepo shape was already covered — there had just been
nothing to prove it on.

**12 of 12 scenarios.** Subjects unchanged at 49 / 172 / 245, which is what proves the JS capture
touched nothing already working.

Stated limit, unchanged: a class member is never judged, and scenario 10 pins it so it cannot drift.
The two fixtures prove the rules hold on those shapes; they are not a claim about a real JS codebase
at scale.

## Phase 1b — analyze, the base

Not one of the twelve tool phases: `analyze` is what the other twelve read, so a hole here is a hole
in all of them at once.

- [x] node completeness, Python — `ast` vs the graph. scraper 1,207 declarations / 0 missing, sofie 114 / 0
- [x] node completeness, TypeScript — `ts.createProgram` vs the graph. sofie 1,452 / 0, orchestrator 569 / 0, conducks 471 / 0
- [x] edge precision — every CALLS edge scored against the SOURCE TEXT. scraper 9,820 / 0 misplaced, sofie 12,028 / 0, orchestrator 8,637 / 0, conducks 9,641 / 0
- [x] line accuracy — `ast` lineno vs node lineStart. scraper **100%** (1,207), sofie **100%** (114) — ADR 0184
- [x] a TypeScript twin for recall and for lines — `ts.createProgram`. lines 99.93 / 100 / 100, recall 96.38 / 98.07 / 96.21 (ADR 0185)
- [x] edge RECALL — Python `ast` vs the graph, per (file, line). scraper **96.83%**, sofie **98.53%**. Ratcheted, not gated: the residue is one shape and not yet attributed (ADR 0183)
- [x] incremental ≠ cold — DOES NOT REPRODUCE across four waves including a three-wave one with external scaffolding, and is now guarded rather than merely absent (ADR 0182)

### The 42 unexplained export misses, explained — and the obvious fix rejected

`sofie::exports` showed 135 missed: 93 referenced only inside their own file (not misses —
`UNUSED_EXPORT` counts that as consumption) and **42 referenced NOWHERE**.

Cause: **a wildcard re-export counts as external consumption.** `kernel/paths.ts` declares
`export const DATA_DIR`, uses it three lines below, and `kernel/index.ts` says
`export * from './paths.js'`. Nothing imports it. The barrel's own edge satisfies "consumed by
another module", so in a barrelled codebase **no symbol in a wildcard-re-exported file can read as an
unused export**.

The obvious fix — exclude a re-export surface's own edge — was written, measured and **rejected**:
sofie went 172 → 354 findings, `EXTRA` went 0 → **182**, and `DATA_DIR` was still not reported. It
traded 42 misses for 182 false verdicts and did not fix its own target. Reverted (ADR 0187).

The baseline's rise from 105 to 135 was the SUBJECT, not prune — the oracle's own total went 245 →
288 as sofie grew.

### JavaScript was riding on TypeScript's coverage

The TS oracles drove off tsconfig, and a tsconfig is the project's BUILD story rather than an
inventory of its source. Each subject left JS out a different way: scraper has **no tsconfig at all**
(33 js files, every TS oracle refused to run), orchestrator has no root one (45), sofie's includes
only `src/**/*` (17).

`ts-program.mjs` unions the tsconfig set with a JS walk, shared by all three oracles. scraper is now
covered where it had nothing: 14 declarations, 0 missing, 100% lines, 98.06% recall.

Proved by catching a real gap: removing the JavaScript `function_declaration` capture takes scraper
0 → **11** missing. Same shape as ADR 0178 — filling an empty cell immediately found a defect.

conducks' recall reads 94.75% rather than 96.21% because 91 JS files now count. A wider measurement,
not a regression.

### The TypeScript half was missing, and the script names hid it

`oracle:recall:sofie` and `oracle:lines:sofie` sound like TypeScript coverage. They are not — both
oracles walk `.py` with `ast`, so on sofie they scored its NINE Python files rather than its 1,452
TypeScript declarations. Two of the five claims had no TS check at all, on ~60% of the material.

| target | line accuracy | edge recall |
|---|---|---|
| sofie | 99.93% | 96.38% |
| orchestrator | 100% | 98.07% |
| conducks | 100% | 96.21% |

Recall lands where Python's does (96.83 / 98.53), which is the first evidence the two language paths
behave alike rather than one being quietly worse.

The line check was wrong before analyze was, from a cause this session has met twice: three of
conducks' four "drifts" were a CASE COLLISION in my own key — `type Verdict` at verdict.ts:32 and
`function verdict` at :52 folded to one lowercased key. Matching exactly took two targets to 100%.

### Every claim the base makes is now scored

| claim | oracle | result |
|---|---|---|
| every declaration has a node | `ast` · `ts.createProgram` | 0 missing, 5 targets |
| every CALLS edge points at real text | the source bytes | 0 misplaced of 40,126 |
| every call has an edge | `ast`, per (file, line) | 96.83% · 98.53%, ratcheted |
| a node's line is the declaration's line | `ast` | 100% · 100% |
| incremental == cold | conducks against itself | 4 waves identical |

A line two out is worse than none — it looks authoritative and sends the reader elsewhere. The
expected decorator divergence turned out not to exist: conducks records the `def` line exactly as
`ast` does, so the tolerance written for it changed nothing and was removed.

### The recall number was wrong three times, and every time it was mine

Edge recall first read **60.17%** — which would have been reported as a serious defect in the base.
Three corrections, each found by looking at a concrete case rather than at the total:

| what was wrong | effect |
|---|---|
| universal members (`.append`, `.strip`) scored as failures, when `isUniversalMemberCall` exists to skip them | — |
| only `lineNumber` read, when one edge carries `properties.lines` — every line that call was seen on | 60.17% → **92.00%** |
| constructors scored as CALLS, when Python spells construction as a call and conducks records CONSTRUCTS | 92.00% → **96.83%** |

`mcp_client.py` lines 11 and 13 both hold `CALLS -> global::len`, which is what made the second one
findable: `len` was top of the failure list and its edges demonstrably existed.

**When an instrument reports a large defect in something several other instruments already cover, the
instrument is the first suspect.** Bad news feels like rigour, which is why it ships unquestioned.

Proved by catching a real gap: narrowing the Python call capture to bare identifiers takes scraper to
**42.67%** and the ratchet fires.

### Run it twice, with an edit in between

`analyze` is incremental by mtime, and the invariant nothing checked is that an incremental pulse must
produce the graph a cold one does. The failure is the worst kind — a graph missing edges answers
confidently and slightly wrongly, and nothing downstream can tell.

It is also the defect a suite structurally cannot see: **every test analyzes once, from empty**, so
every test runs the cold path. ADR 0107 stated the lesson in one line and nothing was doing it.

Four waves — a new file importing an existing one, a file gaining a call, the same in Python, and
three consecutive waves with external scaffolding. All four agree node for node and edge for edge, so
the standing open defect **does not reproduce**.

Proved by recreating ADR 0107's defect: narrowing `allDiscoveredPaths` back to `dirtyFiles` fails all
four with the exact recorded symptom — missing IMPORTS edges, and Python CALLS landing on a dangling
`pkg.lib::helper` the cold graph does not contain.

### Edges are scored against the bytes

ADR 0181. Each CALLS edge records the expression it was built from and the line it was found on —
either that text is on that line or the edge describes something that is not there. The oracle is the
source text: no parser, no second heuristic, nothing shared with the thing under test.

That makes it the first instrument here that is **language-agnostic**, so it covers the nine grammars
with no oracle of their own as readily as the two that have one. 40,126 edges scored across four
projects, **0 misplaced**, nothing skipped for missing metadata.

Proved by catching a line drift: adding 3 to the recorded line takes scraper from 0 to **9,372 of
9,820**. And its loose half was removed for doing nothing — a fallback matching the last segment of a
dotted expression changed the result by zero across 9,820 edges, so it was a line that would only ever
have hidden a real drift.

It does NOT score whether an edge points at the right target, nor recall — a call with no edge is
invisible to it.

### The base had no completeness check

Seven oracles scored what the ARMS say and none scored whether the base contains what the source
declares. `oracle-packs` asks whether a pack's QUERIES capture what its grammar declares — a question
about the query file; whether a capture becomes a NODE is the event every arm downstream reads.

The failure is silent in a way no other is: a declaration with no node is invisible to `prune`,
`trace`, `impact` and `context` at once, and all four look correct while missing it.

Both oracles are proved by catching a dropped capture — removing Python's `function_definition`
capture takes scraper 0 → **1,060** missing; removing TypeScript's `interface_declaration` capture
takes sofie 0 → **69**. Removing the TS `class_declaration` capture moves it by only 1, because
classes are minted by more than one pattern; recorded, because a mutation that barely moves is a fact
about the captures rather than a weak check.

And the oracle was wrong before analyze was, again: its first run called 14 `.mjs` declarations
missing while the graph held 24 nodes for that file — the program walks `allowJs`, the query matched
only `.ts*`.

## Phase 2 — trace

- [x] L1 scraper — scored against an independent BFS over the vault's own edges. Two defects, both fixed by 0174
- [x] L1 sofie — 0 missed / 0 extra across 5 entry points
- [x] L1 orchestrator — 0 missed / 0 extra across 5 entry points
- [x] L2 — ten scenarios in `bench-trace.mjs`, planted chains and bounds. 10/10
- [x] L3 — the counter-halves are in the same ten: an unreachable symbol, an excluded member, an unbounded walk that says so, a cycle that does not repeat
- [x] pin down why the CONTAINMENT-ONLY count is non-zero on a correct build — it was this oracle's own bug, not a disagreement: `reachable()` deletes the start, so an edge FROM the start was invisible. It is 0 on all three now, and a GATE rather than a ratchet

### The rule that nothing was scoring

`oracle-trace` had only ever run on scraper — the single-subject mistake ADR 0176 had just fixed for
prune. On sofie and orchestrator it passes 0/0.

Then mutation testing found what the green numbers hid: **trace's central rule — containment is
location, not dependency — was guarded by nothing.** Deleting the filter left the benchmark 10/10,
the suite green, and the oracle at 0 missed / 0 extra. The oracle could not see it by construction:
its containment check only ever EXCUSED a node from MISSED, so a trace returning MORE never showed.

ADR 0179 scores it in the other direction. It shipped as a ratchet against 24 / 41 / 22 and is now a
GATE at zero: those numbers were a bug in the check, not a disagreement — `reachable()` deletes the
start from its own result, so an edge FROM the start was invisible and a node the start CALLS looked
containment-only. With the start counted, 0 on all three; delete trace's filter and scraper reads
**276**.

Two of my own instruments were wrong before trace was: scenario 03 asserted only that a class was
reached, never that an uncalled method was excluded; and the containment check used `[].every()`,
vacuously true, so it accused a correct build.

### The first measurement found ADR 0091's own defect, in a second place

`trace` caps its walk at a weighted depth of 10. On scraper: 2,397 reachable, 2,057 returned,
`truncated: false` — and no `--depth` flag to raise it. ADR 0091 fixed exactly this for the PRINT
limit in the same file, with the words *"a bound that hides itself is not fine"*. The walk's bound
had never been held to it.

Both bounds are now settable and reported separately: `truncated` means the print stopped,
`depthBounded` means the walk did.

The same measurement found a second defect. The MEMBER_OF exclusion was applied to each node's
SHORTEST path, and dijkstra keeps one route per node — so a symbol whose cheapest route arrived
through containment was dropped even when something genuinely calls it.
`paths.py::resolve_project_path` is called outright and was absent. Re-admitted on evidence, to a
fixpoint.

Residual: 58 nodes, all reachable only through containment — the documented exclusion — and **0 that
trace claims and a walk cannot reach**.

`oracle-trace.mjs` now scores five entry points per run. Its 20 MISSED are a difference of rule, not
a bug: it admits a node referenced from anywhere in its own walk, while trace requires the referrer
to have been kept. Every one is a class member. Ratcheted, with the reason stated.

## Phase 3 — context

- [x] L1 on all three subjects — scored against an independent radius walk, 15 runs each at r=1/2/3
- [ ] L2 — plant neighbours it must return
- [ ] L3 — plant non-neighbours it must not

### The neighbourhood is exactly what its rules admit

`oracle-context.mjs` scores three directions, because one is not enough: a node returned from OUTSIDE
the radius, a returnable node inside it that was MISSED, and a container or ATOM handed back that
neither of those can see.

**Exact on all three subjects** — 0 / 0 / 0 on 45 runs. Proved by mutation both ways: removing the
container filter returns 3,394 nodes its own rules exclude; widening the radius by one returns 12,889
outside it.

The apparent recall gap was the tool's own scope again — 75 of 105 neighbours at r=1 reads as a
serious omission until the three exclusions are modelled: containers are where a thing lives rather
than what is around it, ATOMs are 51% of the graph, and a dangling target has no node to return.
Fourth time this session an instrument's big number was the tool's stated claim.

The SCORE is deliberately unscored: ranking is a policy, and checking it against a second opinion
would only compare two policies.

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
