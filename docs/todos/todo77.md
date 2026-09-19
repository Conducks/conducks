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
- [x] L2 — ten scenarios in `bench-context.mjs`, planted neighbours and bounds. 10/10
- [x] L3 — the counter-halves are in the same ten: a two-hop neighbour absent at radius 1, an island absent at radius 2, the anchor absent from itself, no container returned, an unbounded run that says so

### The radius is the claim

Each mutation hits exactly the scenario written for it: returning containers fails 06, widening the
radius fails 03 and 04, keeping the anchor fails 05. 8.6s, so it gates.

**Scenario 04 was wrong before context was.** It began as "an unrelated symbol is never a neighbour"
at radius 3 — but `two → one → boot → unrelated` is three hops, so at radius 3 it genuinely is one.
The claim worth making is that the RADIUS BOUNDS THE ANSWER, not that a name never appears at any
distance. Rewritten to assert absence at 2 and presence at 3.

Sixth scenario this session wrong before the tool was. The first run of a new scenario set is more
likely to be measuring the fixture than the code.

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

- [x] L1 on all three subjects — `oracle-entry.mjs` re-derives ADR 0113's three rules as set operations over the vault. 408 verdicts, EXACT: 0 missed / 0 extra / 0 reason-mismatch on scraper 19, sofie 7, orchestrator 382
- [x] L2 — ten scenarios in `bench-entry.mjs`, planted entries and near-misses. 10/10
- [x] L3 — the counter-halves are in the same ten: a barrel, a test file nothing imports, a scratch script that is otherwise a perfect root module, a conventional filename inside a test tree, a module a real file imports, and a leaf that imports nothing
- [x] the oracle scores a THIRD direction — both sides agree it is an entry and disagree WHY. ADR 0113 made `reason` a printed audited field, and the first mutation produced 10 rows a missed/extra-only oracle would have scored as agreement
- [>] plant a framework ROUTE at L2 — deferred: routes need a framework the parser recognises, and a fixture small enough to run in the bench did not produce one. Route is scored at L1 only, where orchestrator carries 147 and deleting the rule shows all 147 as MISSED
- [x] the ROUTE scenario is planted after all (2026-09-19): Next.js declares a route by FILE POSITION, so `app/api/hello/route.ts` exporting `GET` needs no framework detection and no fixture bigger than one file — scenarios 11 and 12 in `bench-entry.mjs`, with the route group and the lowercase-`get` counter-half. Proven by mutation: `looksRoute = false`, rebuilt and confirmed in the built output, fails 11 and leaves 12 green

### Every rule fires, and each mutation lands on its own scenario

All three of 0113's rules are exercised by the subjects: `root-module` 258, `route` 147,
`entry-filename` 3. Both instruments were proven able to fail before either green was believed —
eight mutations of `ranker.ts`, each rebuilt and each landing where it should.

| mutation | oracle (orchestrator) | bench |
|---|---|---|
| `index.ts` added to the entry filenames | 20 EXTRA + 10 REASON | 05 |
| the `route` rule deleted | 147 MISSED | — |
| TEST importers counted again | 52 MISSED | 04 |
| `isScratch` dropped | 21 EXTRA | 07 |
| `isTest` dropped | — | 04, 06, 08 |
| the `entry-filename` rule removed | — | 01, 02 |
| the "imports something itself" half dropped | — | 10 |
| the `root-module` rule removed | — | 03, 04, 09 |

The third mutation is ADR 0113's own headline — counting test importers is what hid this
repository's bin, the only real entry point it had.

### Scenario 09 was vacuous, and only a mutation could show it

It claimed to test that a NON-test importer disqualifies a root module. Its middle file imported
nothing, so rule 3 excluded it on the *other* half — scenario 10's claim — and it passed with the
importer check removed entirely. The fixture now has the middle file import a leaf, so a non-test
importer is its only disqualifier, and the same mutation turns it red.

Fourth time in this campaign a scenario was wrong before the tool was.

### The pin file scored a corpus nobody measured

`tools/benchmark/projects.json` calls its SHA "the contract" and still named the pre-refresh commits:
ADR 0167 pulled all three subjects on 2026-08-27 and the pin file was never updated with them. The
counts on disk match this todo's own stated pull exactly — sofie 497/69/9, scraper 235/27/6,
orchestrator 537/225/28 — and did not match the SHAs it pinned. Anyone re-pinning from that file
would have silently scored a different corpus and read every moved number as a conducks regression.
Re-pinned, with the reason in the file.

All three subjects were re-analysed with a freshly built binary before scoring; the vaults on disk
were nine days old and conducks' own predated the current schema entirely.

## Phase 5 — flows

- [x] L1 on all three subjects — `oracle-flows.mjs` re-derives the grouping rule as a closure over the vault. EXACT on all three: scraper 1703, sofie 1212, orchestrator 667, with 0 missed / 0 extra / 0 member-mismatch
- [x] L2 — seven scenarios in `bench-flows.mjs`, planted chains, an ACCESSES-only member, a built-in-only flow, and the floor
- [x] L3 — the counter-halves are in the same seven: a lone symbol that is not a process, a flow whose members are all built-ins, a floor that empties the list and still states its denominator
- [x] decide what an entry point of a FLOW is, now that the confidence test is known not to work — ADR 0191: a cross-service call is the `tier: 'service'` stamp the linker writes, never a confidence. Entry points 8,170 → 6,843 on scraper, 10,789 → 8,099 on sofie, 6,538 → 5,140 on orchestrator
- [x] decide whether a flow may be keyed by a bare NAME — ADR 0191: keyed by the entry's ID, `name` kept as a label. Both surfaces carry the id, and the MCP tool stops recovering the entry with `findNodesByName(name)[0]`
- [x] re-score after the fix — EXACT again on all three: scraper 1174, sofie 481, orchestrator 388, 0 missed / 0 extra / 0 member-mismatch

### The confidence exception swallows the rule it is an exception to

`groupProcesses` admits an entry when it has no incoming CALLS **or** when every incoming CALLS edge
carries `confidence < 1` — the comment says why: a cross-service HTTP call is not a local caller.

**No CALLS edge is ever emitted at 1.** Measured: scraper has 9,820 of them, 5,571 at 0.85 and 4,249
at 0.40, and none at 1. sofie has 12,029 and exactly ONE at 1. ACCESSES does emit 1 — 4,462 of them —
so the vault stores the value fine; CALLS simply never receives it. The exception is therefore always
true, the "no incoming calls" half never runs, and any named STRUCTURE/BEHAVIOR/ATOM with a file
becomes an entry point: **8,170 of them on scraper, 10,789 on sofie, 6,538 on orchestrator.**

The confidences do not mean what the rule reads them as. `http-service-linker.ts:99` stamps a
cross-service call 0.8 — a value that appears in none of scraper's CALLS — and
`adjacency-list.ts:578` PROMOTES anything below 0.6 back up to 0.85. So "less than 1" identifies
nothing in particular.

Caught by `bench-flows.mjs` scenario 02 on a three-file fixture, which is the smallest possible
repro: `head` calls `b`, and `b` is reported as its own flow. The scenario is kept RED and marked
`knownDefect` rather than deleted — a scenario removed because it fails is a defect deleted — so the
bench states it on every run and still gates the six claims that do hold.

**Fixed by ADR 0191**, with the record because it changes what a flow IS: every flow count on every
subject moves. Scraper 1,703 → 1,174, sofie 1,212 → 481, orchestrator 667 → 388. Both movements are
real — fewer symbols are wrongly admitted, and a flow a name collision used to absorb now stands on
its own and mostly falls below the two-member floor instead of inflating another flow's closure.

The magnitude stated first was wrong and is corrected here. "Nearly every named symbol becomes an
entry" is the MECHANISM; the measured effect is 1,327 wrongly-admitted symbols on scraper (16%),
2,690 on sofie (25%) and 1,398 on orchestrator (21%), because most candidate symbols have no callers
at all and would have been entries either way.

**Two unit tests asserted the broken rule and passed.** One built an edge at confidence 0.5 to mean
"cross-service" and one at 1 to mean "local"; the producer emits neither for a CALLS edge. ADR 0028's
trap in a second place — a fixture built from the same misunderstanding as the code confirms it —
recorded there about node ids, and true here about edge confidence.

### The oracle was wrong before the tool was, again

Its first run reported 8 missed flows and 473 member mismatches on scraper. All of it was the
oracle: `collectDownstream` WALKS THROUGH a target whether or not a node exists for it and COUNTS it
only if one does, and the oracle counted every edge target — inflating each closure by its dangling
ends and pushing 8 flows over a floor they do not reach. Corrected, all three subjects are exact.

Fifth time in this campaign an instrument was wrong before the code it measures. The tell was the
shape: the tool's total was 5,328 and the oracle's distinct-entry count was 5,328 exactly, so the
entry sets already agreed and only the closures did not.

## Phase 6 — audit

- [x] L1 on all three subjects — `oracle-audit.mjs` re-derives both cycle rules by MUTUAL REACHABILITY rather than the SCC the tool runs. Agrees on every count: scraper 0 ARCH-3 / 1 ARCH-6, sofie 1 / 6, orchestrator 2 / 1
- [x] L2 — six scenarios in `bench-audit.mjs`: a two-file cycle, a three-file cycle reported as ONE violation, and a same-file mutual call reported as ARCH-6
- [x] L3 — the counter-halves are in the same six: a clean two-file dependency, a single-file loop that is not a module cycle, and self-recursion that is neither
- [x] state what is NOT scored, per rule rather than per command — three of the rules have no reachable instance and are pinned by outcome only
- [x] give the spans-two-files filter a case that reaches it — two classes in ONE file extending each other. EXTENDS is module coupling, so a cluster genuinely forms and the filter is what rejects it; loosening the filter turns the scenario red
- [>] give the two `length > 1` guards a case — deferred: `detectCycles` returns no cluster at all for a self-loop, so nothing can reach them from outside. Reaching them means changing the detector, which is a different job from scoring it
- [x] the deferral premise was WRONG and the guards are gone instead (2026-09-19): `algorithms/cycle-detector.ts:89-96` DOES emit a one-node cluster when the node carries a self-edge, so the guards were reachable — and redundant, because a one-node cluster spans one file and the `files.size > 1` filter beside them already dropped it. Mutating `<= 1` to `< 1` changed no answer, which is what proved it. Both guards deleted, and `audit.test.ts` now pins the self-import outcome against the filter that does decide (mutating `files.size > 1` to `>= 1` fails three cases)

### Two rules are unexercised by every subject, and the bench cannot reach them either

Measured, not assumed. Each mutation was applied, confirmed present in the BUILT output, and run
against all three subjects:

| mutation of `governance/index.ts` | oracle | bench |
|---|---|---|
| ARCH-3 stops ignoring containment/erased/local edges | sofie 1 → **2, DISAGREE** | — |
| ARCH-3 drops the spans-two-files filter | no movement on any subject | 6/6 still |
| ARCH-6 follows ACCESSES as well as CALLS | no movement on any subject | 6/6 still |
| ARCH-3 drops the spans-two-files filter, **against scenario 07** | — | **07 RED** |
| either `length > 1` guard loosened to accept a singleton | — | 8/8 still |

The first bites. **The spans-two-files filter was unreachable until a scenario was built for it**:
two classes in one file extending each other. EXTENDS is module coupling, so a genuine cluster forms
— the vault holds exactly `EXTENDS alpha -> beta` and `EXTENDS beta -> alpha` and nothing else — and
the filter is what rejects it. Loosening the filter turns scenario 07 red, so the rule is now scored
even though no real subject exercises it. ARCH-6's CALLS-only restriction remains unscored: adding
sofie's 8,327 ACCESSES edges creates no cluster CALLS did not already form.

The `length > 1` guards are stranger and worth writing down: `detectCycles` returns **no cluster at
all** for a self-loop, so neither guard ever receives one. They are defensive against a detector that
could start returning singletons, not against anything it does today. Verified directly on a
one-function fixture — `fact` calling itself gives 0 violations, 0 discoveries, `cycles: 0`.

### Three bench scenarios pass, and not for the reason they first named

Scenario 02 pins that a single-file loop is not an ARCH-3 violation, and the spans-two-files filter
is not what makes that true — two functions in one file produce CALLS edges, and ARCH-3 traverses
module coupling only, so there is no cluster for the filter to reject. That is what scenario 07 was
added for. Scenario 04 pins that recursion is not a defect, and the size guards are not what makes
that true either. Scenario 08 claimed to prove ARCH-3 traverses EXTENDS and does not: its cluster is
carried by the two `import` statements, and ignoring EXTENDS leaves it green. 07 proves that instead.

Both are kept, because the OUTCOME is worth pinning and a reader changing either rule wants to know
it stayed true. Both now say in their own `why` what they do not prove. A scenario that passes for
the wrong reason and does not say so is the vacuous test this campaign keeps finding — this is the
same finding, caught before it was recorded as a pass rather than after.

### The oracle read the gate's own exit as a crash

`audit` exits 1 when it finds a violation, which is the entire point of it. The first version used a
plain `execFileSync` and threw on exactly the two subjects that have something to report — scoring
nothing on the runs that mattered and passing on the clean one. Sixth instrument in this campaign
wrong before the code it measures.

It was also under-specified twice: it modelled neither the cluster-of-one exclusion nor the
spans-two-files rule, and agreed on all three subjects anyway. Right answers, wrong reasons, and only
reading `governance/index.ts:63` rather than trusting `conducks-core.ts::audit()` showed it.

### There are two ARCH-3 implementations, and the CLI uses neither the one that looks canonical

`conducks-core.ts::audit()` runs the same cycle detection with the same options and is called by
NOTHING — every surface (`audit`, `status`, the MCP tools, the mirror's governance panel) goes
through `registry.audit.audit()` → `governance.audit()`, which has two filters the core copy lacks.
The first three mutations of this phase were applied to the core copy and changed nothing, which is
how it was found. Not removed here: deleting a second implementation of an audited rule is its own
change with its own measurement.

## Phase 7 — guard

- [x] L1 — `oracle-guard.mjs` re-derives the layer contract from the vault by SQL join and compares to the pairs `guard` prints plus its exit code. EXACT on conducks (1425 classifiable edges, 0 illegal) and sofie
- [x] L2 — seven scenarios in `bench-guard.mjs`: an illegal upward edge blocks and names the pair, cli→composition passes while cli→domain blocks in the same tree, one line per illegal pair not per edge
- [x] L3 — the counter-halves are in the same seven: a legal downward edge, a same-layer edge, a test file exempt, a single pulse that says NOT ASSESSED and refuses the safe-limits line
- [x] decide whether the layer contract should be per-project, or say in the output that it is not — DECIDED 2026-09-19: say it is not, and make the output say it. `LAYER_FRAGMENTS` matches this repository's own directory names (`/lib/core`, `/lib/domain`, `/contracts`) and `sentinel.yml` can express rules but not layers, so on any other project nothing maps, no edge is judged, and the check printed a clean pass — the "0 checked, exit 0" shape this repo already refuses elsewhere. `governance/index.ts` now counts how many endpoints mapped to a layer and, at zero, emits a `NOT CHECKED` warning naming the layers it looked for and why none matched
- [x] Per-project layers were NOT built, and the reason is recorded rather than deferred silently: it is a real feature — a YAML schema for fragments and allowed edges, validation, and docs — and the minimal parser currently reads only `rules:`. The honest interim is a gate that refuses to claim a pass it did not earn
- [x] per-project layers are now BUILT (ADR 0197, 2026-09-19): `.conducks/sentinel.yml` takes a `layers:` list of `name` / `path` / `allow`, read by `loadLayerContract`; an unusable declaration reports NOT CHECKED as an error instead of falling back to conducks' own fragments. The interim above stands as written — it is what shipped between the two dates

### `guard`'s hard gate is a no-op on any project that is not conducks

`LAYER_FRAGMENTS` (`src/lib/domain/governance/sentinel-rules.ts:52`) is hardcoded to conducks' own
paths — `/lib/core`, `/lib/domain`, `/registry`, `/interfaces/*`, `/contracts`. On scraper and
orchestrator **zero** dependency edges classify into any layer, and `guard` still prints
`✅ Layer contract clean.` and exits 0.

Verified by running it: a tick over nothing, which is ADR 0044's shape. The rule's own comment admits
the scope — *"this guards conducks itself; per-project layer config is a future enhancement"* — so
the code knows and the output does not say so. The resonance half of the same output DOES declare
what it skipped ("1017 symbol(s) had no fingerprint … were NOT compared"). One half is honest.

Sofie is worse than a no-op rather than better: its 62 classifiable edges are all `src/registry/...`,
classified as the `composition` layer by coincidence of a directory name in an unrelated project.

**This is todo06's defect in a second form.** The comment at `sentinel-rules.ts:186` records the
first: `guard` "filtered for a rule that was never loaded and printed Layer contract clean without
checking anything". The rule loads now. It classifies nothing, and prints the same sentence.

`oracle-guard` is registered against conducks only, where it is EXACT and meaningful. Pointing it at
a subject returns NOT ASSESSED and exits non-zero by design — that disagreement IS the finding, and
registering it as a script would hand CI a red nobody can clear until the contract is per-project.

### Renaming the rule in config silently disarms the gate

`guard.ts:33` filters `v.ruleId === 'layer_boundaries'` while `governance/index.ts:274` dispatches on
`rule.condition` and sets `ruleId: rule.id`. A rule with `condition: layer_boundaries` and any other
`id` still computes its violations — `guard` then files them under "Other structural findings" and
exits 0. The id-to-filter coupling is already carried by a comment; `bench-guard` is the first thing
that tests it.

### `DEPENDENCY_EDGES` is declared twice

`governance/index.ts:315` and `:380` each define the same four-type Set. Found by an assert refusing
a mutation whose anchor was claimed unique and was not. Two copies of one rule drift; not fixed here,
because it is its own change with its own measurement.

## Phase 8 — advise

- [x] L1 on all three subjects and conducks — `oracle-advise.mjs` re-derives the denominator and the Monolithic-Hub exclusion ladder from the vault. EXACT on all four: `checked` matches the vault symbol count exactly (9822 / 8936 / 13596 / 9085), 0 missed / 0 extra
- [x] L2 — five scenarios in `bench-advise.mjs`: a behavioural class is a hub, a Python class is, the `--json` shape carries its denominator
- [x] L3 — the counter-halves are in the same five: an interface with identical fan-in is not a hub, a `@dataclass` and an `Enum` are not, containers and built-ins are never hubs, same-file callers do not count. Each pair sits in ONE repo with identical fan-in, so the graph-derived threshold cancels out instead of drifting between fixtures
- [x] the CONTAINERS exclusion is UNEXERCISED — measured, not assumed

### Seven of advise's eight rules are unscored, and that is stated rather than discovered

Only the Monolithic-Hub ladder and the denominator are scored. CIRCULAR, INTUITION, HIDDEN_COUPLING,
the composite risk score, unpinned dependencies, SplitScore and external coupling are covered only by
the `--json` shape assertion. Five of them are weighted policies over hand-picked constants, and
scoring a policy against a second opinion compares two opinions.

### The CONTAINERS exclusion has no instances

Removing `if (CONTAINERS.has(...)) continue;` from `advisor.ts` changes NOTHING on any of the four
corpora — verified present in the compiled output, then measured: advice count 3 before and after,
on all four. No container node reaches the hub threshold, so the guard never fires. Same shape as
ARCH-6's ACCESSES restriction in Phase 6: a rule that is correct, and unreachable.

Worth its own look later: `advise` emits exactly 3 advice on four projects of wildly different size
and language, and ZERO Monolithic-Hub advice on any of them, while the ladder admits 36 / 13 / 20 /
46 candidates. Not investigated here.

## Phase 9 — diff

- [x] L1 on all three subjects — `oracle-diff.mjs` asks DuckDB for one relational FULL OUTER JOIN where `diff` builds two JavaScript Maps and diffs them with `Map.has`. EXACT on all three: scraper 8785 changed, sofie 13103 changed + 6 removed, orchestrator 8371 changed, 0 missed / 0 extra / 0 value mismatch
- [x] L2 — eight scenarios in `bench-diff.mjs`: a symbol that appeared, one that vanished, growth attributed to the symbol that grew, `--head` honoured
- [x] L3 — the counter-halves are in the same eight: an untouched neighbour is not reported, a pulse pair with no structural change reports nothing, an empty base is refused rather than answered

### The premise this phase was briefed with was wrong, and the agent refused it

The brief asserted every subject holds ONE pulse, so `diff` and `drift` could not be scored against
them. That came from counting `SELECT COUNT(DISTINCT pulseId) FROM nodes`, which holds only the
CURRENT pulse. `node_history` is the per-pulse table and holds **2 / 2 / 3**. The agent checked
read-only, refuted the premise from the vault, and ran the L1 it had been told was impossible.

Read the method whose name you are trusting — applied to a table name.

## Phase 10 — drift

- [x] L1 on all three subjects — `oracle-drift.mjs` re-derives the verdict, decay count, move count and identity gap. EXACT on all three: STABLE, decay 0, moves 0, gaps 1017 / 2469 / 2271
- [x] L2 — ten scenarios in `bench-drift.mjs`, including a rename the engine must pair and a decaying symbol it must rank
- [x] L3 — the counter-halves are in the same ten: a stable pair called stable, a shape collision that must not invent a move, a single pulse that says INSUFFICIENT_DATA
- [x] reconcile `drift` reporting STABLE while `diff` reports 13103 changed symbols on the identical pulse pair — NOT a contradiction, and neither command is wrong. `diff` counts a symbol changed on `gravityShift !== 0 || complexityBloat !== 0 || dnaShift` with NO threshold (`src/interfaces/cli/commands/diff.ts:169`); `gravity` is damped PageRank, which is global, so one new edge perturbs every node's score by some epsilon and 13,103 reads as "the graph changed at all". `drift` says `DECAYING` only above `DECAY_VELOCITY_THRESHOLD = 0.05` (`src/contracts/scoring.ts:32`), so STABLE means "nothing decayed meaningfully". Two different questions wearing similar words; recorded rather than "fixed", because changing either would make it answer a question nobody asked

### `drift` says STABLE over 11,127 fingerprint changes

Measured on the same pulse pairs the oracles used: sofie has **11,127 fingerprint changes and 6,871
gravity changes** across 13,596 comparable symbols, and `drift` reports `STABLE` with
`decay_count: 0`. `isModified` is computed per row and never reaches the summary or the verdict —
there is no modified-count field at all. `diff` calls 13,103 of those same symbols changed.

Both are right by their own rules and they read as contradictory to anyone running them side by side.

### `drift --json`'s `deltas` is unusable to a machine caller

It is `result.deltas.slice(0, 10)` in ARRIVAL order — unfiltered, unsorted — so on a fixture with
`decay_count: 1` the array holds ten velocity-0 rows and the decaying symbol is absent. `improving`,
two fields away, IS filtered and sorted: the F-06b fix was applied to one side only. The rendered
path sorts correctly. `truncated: true` is set, so it does not lie — it just cannot be used.

### `analyze` is deletion-blind

Two files → analyze → delete one → analyze prints "No changes detected. Structural Synapse is already
at 100% resonance" and writes NO second pulse. A deletion is invisible to change detection, which is
why `bench-diff` scenario 02 has to co-edit a surviving file to obtain a pulse pair at all.

## Phase 11 — doctor

- [x] L1 — `oracle-doctor.mjs` scores the ONE claim doctor makes that can be re-derived behaviourally: it says 13 grammars are available; the oracle plants one file per language, runs a real analyze, and asks the vault whether a symbol from INSIDE each file arrived. AGREES — 13 promised, 13 proved, 0 overpromised, 0 underpromised
- [x] L2 — twelve planted environments in `bench-doctor.mjs`: no vault, empty vault, vault with db, mtimes at 12 minutes / 3 hours / 5 days asserting the UNIT switches, the legacy db name, git genuinely absent from PATH
- [x] L3 — the counter-halves are in the same twelve: a healthy environment it must not warn about, a non-candidate file it must not read as a vault, git present
- [x] decide whether `doctor` should exit non-zero when a check fails — DECIDED 2026-09-19: yes. Measured before: no vault, every check `[✗]`, exit 0 — so it could not gate CI or a git hook and every failure marker was decoration. `fail()` now increments a counter and a non-zero count sets `process.exitCode = 1`. Verified both ways: an empty directory exits 1 naming the failure, this repository exits 0
- [x] A WARNING deliberately does not fail: "an update is available" and "could not reach GitHub" are states of the world, not of the installation, and failing on them would make the gate unusable offline or one release behind
- [x] The `[✗]` branches were this phase's unscored half. `tests/unit/interfaces/cli/commands/doctor-exit-code.test.ts` pins the wiring — a failure counts, a warning does not, the count decides the exit, and no early `process.exit` hides the remaining checks. Broken deliberately: removing the increment fails two of its four cases. It asserts the WIRING, not that each individual check judges its subject correctly; `bench-doctor.mjs` owns that half

### `doctor` always exits 0

Measured: no vault, and it still exits 0. It cannot gate CI or a git hook — every `[✗]` is cosmetic.
Not asserted as correct in the bench; recorded here as a decision someone has to make.

Its `[✗]` branches are also unscored, and that is stated rather than hidden: reaching them means
removing packages from `node_modules`. The `[✓]` half is proved true; nothing proves the failure path
works at all.

## Phase 12 — list

- [x] L2 — ten planted registries in `bench-list.mjs`: an absent file, a live link to a really-analyzed workspace, a gone path, a never-analyzed path, all three mixed with the "2 of 3" count, corrupt JSON, a wrong shape, a non-string array, the legacy db name, and `CONDUCKS_WORKSPACE_ROOT` with two disagreeing link files
- [x] L3 — the counter-halves are in the same ten, and the exit codes are asserted: 1 for corrupt and wrong-shape, 0 otherwise
- [-] L1 with an oracle — dropped: `list` reads `links.json` and does two `fs.existsSync` calls per entry, so an "independent" re-derivation is those same two calls written a second time. Stated in the bench header rather than left implicit
- [x] reconcile what `doctor` and `list` each count as a vault — a REAL inconsistency, now fixed. `persistence.ts:120` writes exactly one filename and always has; `list` checked that one; `doctor` also accepted `synapse.db` and `conducks.db`, names nothing writes and nothing migrates. So a `.conducks/` holding only a legacy name made `doctor` print "last pulse: N ago" while `list` called the same project `not-analyzed`. Eight sites held the literal; it is now `VAULT_DIR` / `VAULT_DB_FILENAME` in `src/contracts/vault.ts`, read by all of them
- [x] Pinned by `tests/unit/contracts/vault-filename-is-one-contract.test.ts`: the name appears in no source but its own declaration, and neither command carries a name of its own. Broken deliberately — a legacy name put back into `doctor` fails the third case

### `doctor` and `list` disagree about what a vault is

`doctor.ts:82` accepts three db filenames; `list.ts:42` accepts only `conducks-synapse.db`. Verified
in one directory at one moment:

```
doctor: [✓] Vault at .conducks/ (last pulse: 0 minutes ago)
list  : [No Vault] … holds no synapse yet
```

### `list` refuses to run without a vault it does not need

Measured: in a repo with no `.conducks/`, `list` exits with `[No Vault] … Run conducks analyze`. It
reads a JSON file and stats paths — it needs no graph at all. A user whose workspace is not analyzed
cannot see the links they created, and the error names an unrelated cause.

`CONDUCKS_WORKSPACE_ROOT` is also half-honoured: it changes which `links.json` is read but not where
the bootstrapper anchors, so `list` prints one root while the process is anchored on another.
