# domain/evolution — dead code, drift, and the file watcher

**Layer:** domain. Imports core + contracts.

**Responsibility:** what changed and what is no longer needed. Dead-code (`evolution/dead-code.ts`)
finds orphans and unused exports; drift (`evolution/drift-engine.ts`) compares the graph against a
baseline; the watcher (`evolution/watcher.ts`) drives incremental re-analysis;
layer-diff and merge-impact, which compared two stored layers structurally, were removed with commit
layers (todo48#P4).

The `diffLayers()` reasoning that stood here is kept in the closed record rather than in a live
note: it matched by id first and only then by a fingerprint UNIQUE on both sides, so an overload
pair could not be reported as a move nobody made. That rule is worth re-reading if layer diffing is
ever rebuilt — see todo48#P4 and ADR 0035.

**Boundaries:** advisory only. Nothing here deletes anything, and nothing here should ever be wired
to an automatic fix.

**Uses:** [core/graph](../core/graph.md) for edges and usage evidence (`USAGE_EVIDENCE_EDGES`,
`PRUNABLE_BINDING_KINDS`), and a stored baseline via [core/persistence](../core/persistence.md) for the
drift comparison. Read by `conducks prune`, `conducks drift` and the watcher's incremental re-analysis
trigger.

## Features

- **Dead code detection** (`conducks prune`) — flags exported symbols no proven edge reaches, as review
  candidates, excluding entry points and test fixtures. Under-reports on purpose: a missed dead symbol
  costs a review pass, a wrong one costs a user their build, and prune is scored on both directions at
  once (`tests/integration/features/prune-precision.test.ts`) rather than on how much it finds — the
  same principle [domain/analysis](../analysis.md) states generally (score what was found WRONG, not
  what was found).
- **Longitudinal drift** (`conducks drift`) — tracks structural velocity and decay across recorded
  pulses; a single snapshot cannot show direction, only a comparison against a baseline can.
- **Live watch** (`conducks watch`) — the watcher drives incremental re-analysis on file change.

## Glossary

- **Orphan** (this module's sense) — a node with no incoming edge. [governance](../governance.md) uses
  the same word for a *dangling edge* (a target that was never induced) — never quote one count as the
  other.
- **Stale import** — an import statement whose binding has no evidence of use anywhere in its file.

## Traps

**`conducks rename` was removed and must not be re-added** (ADR 0156). `conducks rename`,
`conducks_rename`, `GVREngine` and `RefactorResult` are gone; `tests/unit/adr-invariants.test.ts` fails
the build if a `rename*.ts` or `gvr*.ts` module returns under `src/`, or if any MCP tool declares
`destructiveHint: true`. It looked obviously buildable and was rebuilt in spirit twice; correct
renaming needs TYPES — overloads, aliases, re-exports, structural typing, `this` binding — and conducks
has a syntax graph, not a type checker. Each attempt printed success over a tree that no longer
compiled.

**"Rename" means two unrelated things.** `drift` reports `Renamed/Moved: N` — this is DETECTION, it
observes that a symbol changed name between two pulses and writes nothing. It is alive and unaffected
by the removal above. Do not delete drift's rename detection while cleaning up after the removed
command; the drift tests now rename fixtures by hand (`renameByHand` in
`tests/integration/features/helpers.ts`) rather than shelling out to the gone command.

**Deferred / not built:** raising `STALE_IMPORT` recall past its deliberate floor. The finding fires
since 2026-07-25 (`findStaleImports` — for a year it was gated on raw tree-sitter node types that
labels never carry, then blocked on missing inheritance edges; todo11 closed both). It reports only
on affirmative absence across every evidence class. The recall gap is a query-coverage problem, not
detector logic, and un-excluding type targets before the type-position captures exist would re-create
the measured 36-false-positive flood (todo14).

**`watch` intermittently never saw a file created after it started, and the standing explanation for
it was wrong.** A test note blamed CPU load and recommended moving the test to a serial jest project;
run alone, in isolation, it still failed roughly 1 in 3 (todo55). The real cause: `start()` returned as
soon as chokidar was constructed, before chokidar's `ready` event fired, so the command printed "Live
Mirror Mode active" and ran its startup reconcile while chokidar was still indexing — a banner
claiming a liveness the watcher did not have. Fixed by awaiting a `readyPromise` resolved from
chokidar's own `ready` event (`src/lib/domain/evolution/watcher.ts:136`) before anything is
considered live. Two lessons travel with the fix: an unverified flake explanation becomes folklore the
next reader inherits as fact — run it alone in a loop before accepting "flaky under load" — and do not
diagnose a spawned process by counting lines in jest's captured output, because a FAILING run waits out
its timeout window and flushes far more output than a passing run that exits early, so line counts
differ for reasons unrelated to the defect. Reproduce instead by driving the BUILT CLI from a shell
with output redirected to a file and reading the whole log.

**"Zero false positives" was the claim here and it was wrong** (todo63, 2026-08-11). It held on
conducks itself — 1 finding — and was never checked against a subject with a different style. On
subject-c it produced 20, and every one whose target was a plain VALUE was suspect: three spot-checked
were all false, including a constant used three times in the very file whose import was called stale.
Cause: a bare value read produces no edge, so "no evidence of use" was read as evidence of no use.
`variable` is now excluded from `PRUNABLE_BINDING_KINDS`, taking subject-c to 10. The floor is therefore
LOWER than it was on purpose — a genuinely stale value import is no longer reported at all, which is
this module's own rule applied honestly: a missed dead import is acceptable and a wrong one is not.

**A suppression is invisible to a two-sided oracle.** `isEntryPoint` (`src/lib/domain/evolution/
dead-code.ts:711`) tested its five entry-point convention names — main, index, app, handler, setup —
with a SUBSTRING match, so "Approval" contains app, "Domain" contains main, "Wrapper" contains app,
and "NameIndex" contains index; each one skipped both the ORPHAN and the UNUSED_EXPORT branch.
Census of exported names caught: 53 of sofie's 887, 21 of orchestrator's 656, 5 of this repository's
445. Tightening to equality turned 18 of them into findings the language service agrees with, EXTRA
still 0 on all three. No oracle could have found it: EXTRA scores what the tool SAYS, and a
suppression makes the tool SILENT, which contradicts nothing — it lands in MISSED, mixed in with
every other cause, and MISSED only ratchets, it never fails a build. Read the SUPPRESSIONS when a
recall number will not move — `tests/integration/features/prune-precision.test.ts`'s
`deadApprovalGate` fixture now carries the substring-only failure mode as a named check.

**"Keep it, it is a working capability" is a claim about VALUE, and value is measurable.** A Python
method-resolution-order resolver was carried for weeks as not-dead-just-unwired, with a comment saying
it was "written and never connected" and that wiring it "needs its own measurement" — the comment was
right about the classification and never took the measurement, so the code sat as a standing orphan in
every audit while reading as a decision already made. Measured before deciding, on the one Python
subject available: 52 classes inherit from an in-project base and 112 inherited methods exist, but
0 of 401 `self.method()` calls reach one, and only 5 of 1,721 dangling calls name a base-only method —
an upper bound, since resolving also needs the receiver's class, which Python code rarely states. So
the capability would fire on at most 0.3% of the dangling set, against the risk of a wrong edge.
Removed 2026-08-17 with the measurement recorded here so nobody re-derives it — the code is gone and
carries no anchor of its own. "Not dead, just unwired" is only half an answer; the other half is what
wiring it would BUY, and that number has to come before the comment that defers the work, or the
deferral becomes permanent and looks deliberate.

## Prune must under-report, and here is the proof

An attempt to derive unused imports from per-file usage produced 232 findings against
`tsc --noUnusedLocals`'s 96. The cause was not the import logic: the graph carried **zero
EXTENDS/IMPLEMENTS edges** at the time, so `implements ConducksCommand` registered no usage and every
CLI command's interface import looked unused. It was reverted rather than shipped.

That input has since changed — the vault holds 27 `EXTENDS` and 57 `IMPLEMENTS` edges today
(measured 2026-09-19), because every heritage pattern now co-captures a definition node
([languages](../core/parsing/languages.md)). The rule below is what survives; the specific number
that produced it does not.

That is the standing rule. Dynamic dispatch, DI property chains and entry-wired symbols have no
incoming edge, so they read as orphans while being perfectly alive. A finding that is wrong 40% of
the time is worse than no finding, because it trains the reader to ignore the tool.

## Current precision, measured

**Re-measured 2026-09-19: 8 ORPHAN + 55 UNUSED_EXPORT + 72 UNIMPORTED_MODULE on conducks**, and the
eight orphans are all Rust test functions under `plugins/checklist/`. The audit below is the
2026-08 measurement and its symbol-by-symbol reasoning is what makes it worth keeping — re-run
`conducks prune` before quoting any of these counts.

25 ORPHAN + 5 UNUSED_EXPORT on conducks, audited symbol by symbol: **20 of 25 orphans are genuinely
unreferenced** (14 have zero textual occurrences anywhere; 6 more appear only in archived tests,
comments, or a barrel re-export nothing consumes). All 5 unused exports are correct — the fix there
is dropping the `export` keyword, not deleting the symbol.

**Those counts are from the audit that produced them and are NOT current.** Re-measured 2026-08-17:
105 findings on conducks — 45 UNIMPORTED_MODULE, 57 UNUSED_EXPORT, 2 ORPHAN, 1 STALE_IMPORT. The
shape moved because the codebase did (twenty doors added in the ADR 0150 campaign turn a symbol's
reachability inside out). The AUDIT above is what is worth keeping — the ratio was established by
reading each symbol, and a re-run of the tool cannot re-establish it. Recount, never quote.

The 5 remaining false positives are all dynamic dispatch: four registry getters reached via DI
property chains, and a browser entry point. That profile is expected and acceptable.

**Auditing a finding by name-grep is WRONG and has been wrong four separate times.** A bare
`grep -rn "\bSym\b"` counts prose, comments, test mocks and same-named symbols in other files. Two of
ten spot-checks on subject-c looked like conducks was wrong and it was correct both times: `Console`'s only
"use" was the word inside an `<h3>Sandbox Console</h3>` heading, and `MemoryEdge` was imported by three
files that all take a DIFFERENT `MemoryEdge` from a types module of their own. Zero occurrences is still meaningful;
any non-zero count is not.

Audit against the claim the finding MAKES — for an ORPHAN, "is this symbol IMPORTED or CALLED anywhere
outside its own file", scoped to source extensions and excluding build output.

## Precision on a FOREIGN codebase, measured

The numbers above are conducks auditing itself. Driven at a frozen benchmark subject (subject-c, 10.5k
nodes) on 2026-08-09: **172 findings, ~94.8% precision**, and every error came from ONE mechanism
rather than scattered noise — symbols reached only through `await import()`.

**That mechanism was fixed on 2026-08-17 (ADR 0153)**, and this is the payoff of having named a
single cause instead of calling it noise. Three things were wrong at once: the specifier resolved
only through the project's BUILD layout, an un-renamed destructure of a dynamic import registered no
local binding, and `as_expression` had no value-position pattern. On the same subject the findings
go 147 → 141 with **zero new ones**, and the six symbols this was measured against are all gone.

That mechanism has two halves and only one is fixed. A dynamic import written inside a function is now
resolved (todo58, see `core/graph/linkers`). The remaining seven are specifiers written against the
BUILT layout: an electron entry point imports a parent-relative path that, in the SOURCE tree, resolves
to a directory which does not exist — the real file lives under the source root, and the path only
works once the compiler has emitted both as siblings in the output directory. No source-level resolver follows that without
modelling the build, and an unresolvable specifier should inflate the DANGLING count rather than
quietly make a symbol look dead (ADR 0070).

**The finding types are one list**, in `contracts/dead-code-types.ts`: ORPHAN, UNUSED_EXPORT,
STALE_IMPORT, UNIMPORTED_MODULE, ONLY_IMPORTED. The MCP tool used to hard-code three of them into
its summary and its enum, so `summary` totalled 95 against a stated `total` of 99 and two types were
unreachable by any filter (todo53). Two types are QUESTIONS rather than verdicts —
`UNIMPORTED_MODULE` and `ONLY_IMPORTED` — and both surfaces say so.

`UNREACHABLE_LOGIC` was in this list and is gone: nothing ever emitted it, so it was a row that made
the contract wrong (ADR 0172). `ONLY_IMPORTED` replaced it for the opposite reason — an unused import
was silencing ORPHAN while STALE_IMPORT skipped the same statement, so a symbol could be laundered
into looking alive by a binding nobody read (ADR 0162).

## Why dead-code got better for free

Adding TypeScript type-position captures flipped this module's `graphTracksTypes` self-calibration
on. It suppresses type-declaration reasoning entirely when the language emits no TYPE_REFERENCE
edges — correctly, since otherwise every type would look orphaned. Once TS emitted them, real dead
types surfaced: orphans went ~8 → 25, and the new ones were genuine.

That number has since moved the other way, and the reason is worth more than the number. Measured
2026-08-29: **10 orphans**, none of them in `src/`. Adding value-position captures (ADR 0165) bound
the property-chain reads that the DI shape produces, which retired a class of false positive rather
than finding more dead code. Nine of the ten are Rust `#[test]` functions in `plugins/checklist/`,
invoked by a harness the graph cannot see — the same entry-point shape conducks already exempts in
languages that HAVE an oracle, and evidence for the gap rather than a new one.
