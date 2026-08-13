# Handover — 2026-08-13
Status: current

## Where it stands
Gates green: **1,837 tests / 238 suites**, typecheck 0, `docs-lint` 186 governed docs, `visuals-lint`
clean (62 anchors, 60 review stamps), architecture 5/5, declared-deps clean. All three frozen subjects
`unchanged` vs baseline — RE-SAVED twice today (todo63, todo64), warm and cold.

**Closed today: todo56, todo59, todo62, todo63, todo64.** todo61 is all but done. What is left is
todo57 (the BFS extraction), todo60 (needs an idle machine), and two decisions that are genuinely
yours — todo58#P1 and the publish.

**The suite is not reliably green and nobody knows why.** Across nine runs today: `rename-safety`
(twice, two different lines), `kinetic` (4 tests), `blocking-commands` (1) — FOUR distinct suites,
all integration, all spawning child processes. Two of the three captured runs were contaminated by
work happening in another shell at the same time, so the rate is not trustworthy either.
Do not read a green run as settled, and see todo60 Phase 3 for how to measure it properly.

Work sits on branch `mcp-surface-walk-and-concurrency`, **25 commits ahead of `main`, nothing
pushed**. Everything below is committed: `feat(persistence): move the vault to a NAPI DuckDB driver`
and `fix(prune): stop reporting a used value import as stale`.

**`npm run test:fast` is the inner loop — 26s, 1,143 tests.** `npm test` is the gate at ~235s and 1,830.
Use the gate before a commit; do not use it to chase a failure.

## 2026-08-10 — the install stops compiling DuckDB, and what that uncovered

ADR **0149**: the vault driver is `@duckdb/node-api` (NAPI, one binary for every Node) instead of
`duckdb` (node-pre-gyp, one binary per ABI). `npm i -g` from a packed tarball went from **past ten
minutes still compiling** to **39s** with no compiler invoked. **todo56 is CLOSED** (`completed/`).

Verified on four triples, each a clean-prefix tarball install plus a real `analyze` — darwin-arm64
39s, linux-arm64 38s, linux-arm64-musl 38s, linux-x64 47s (emulated, via Docker).

The port was NOT one file, as the todo had assumed — `getRawConnection()` hands the driver's
connection to five callers. Row shape was verified unchanged by diffing both drivers against this
repo's own vault before anything was rewritten. `close()` lost its 5-second timeout race (the new
close cannot hang) and now checkpoints the WAL away, so a stale `.wal` is strictly a crash signature.

**The tarball install caught a publish blocker no test could have.** `minimatch` and `chalk` were
imported by shipped code and declared nowhere — they arrived through `duckdb` → node-pre-gyp → glob,
and dropping that dependency took them with it. The suite stayed green throughout, because the repo
has both via devDependencies. `scripts/check-declared-deps.mjs` now fails the build on any undeclared
import (CONDUCKS-42). **Publishing before this was landed would have shipped a broken package.**

Two things this uncovered that were true before and invisible:

- The suite's referential-integrity assertion had **never checked anything** — it passed params in the
  shape the old driver did not take, the error was swallowed, and `[]` read as "0 dangling". Rewritten;
  three of the four things it reported turned out to be the QUERY being wrong (it partitioned by
  `pulseId`, but analyze is incremental). What survived became **todo62 — now closed, see below**.
- `persistence.ts.m`, a stale 919-line copy of the persistence layer, is deleted (todo56#P3).

**And the musl install found a nine-day-old lie.** On alpine, where `tree-sitter` cannot build,
`doctor` printed "Parse path: Gnosis regex fallback — Analysis still works, at lower fidelity" and the
very next `analyze` refused. ADR **0089 deleted that fallback** and the promotion never happened: six
living files still described it as current — `doctor`, `features.md` (a whole capability entry),
CONDUCKS-27, `memory.md`, the `conducks-cli` skill that ships into every repo, and two module notes.
All six corrected. Doctor now reports `Parse path: NONE` as a failure, mutation-verified.

**Conducks installs on musl and cannot analyze on it without a toolchain.** That is not new and not a
DuckDB problem — the musl DuckDB binding resolves fine. The remedy doctor prints is measured, not
guessed: `apk add build-base python3` then `CXXFLAGS="-std=c++20" npm i -g conducks` → all 13
grammars, real graph. Decide whether Alpine-without-a-toolchain is a supported story before publishing.

## 2026-08-13 — todo61: a duplicate door caught before it shipped, and a real denominator bug

**`conducks flows --json` emitted a bare array**, so `[]` meant both "no flows here" and "4 exist and
none matched". The denominator was in the rendered output and in the MCP tool and missing from the one
surface a machine reads (ADR 0115/0145). It now returns `{flows, total, matching, shown}`.

**I nearly shipped a second door onto `drift`.** todo61 said the CLI lacked it; `conducks drift`
already existed, on the same `registry.evolution.compare()`, under a different COMMAND NAME. The gap
came from comparing `diff`'s flags against `conducks_diff`'s parameters — the exact mistake ADR 0148
records for `audit`. Reverted. What was actually missing was `--json` on `drift`.

**The pairs gate was NOT strengthened, deliberately.** todo61#P2 asked for "reaches the same domain
function"; ADR 0148 argued against that in writing, and two measurements agree — `query` legitimately
returns echoes the tool does not, `drift` legitimately renders as text. A call-graph gate would have
been wrong twice on its first run. The strong check is
`tests/integration/features/surface-equivalence.test.ts`, which compares ANSWERS on real data over
stdio JSON-RPC and cannot false-fail on rendering. Five pairs, each mutation-verified.

Also noted: the static gate pairs a tool with a CLI file of the SAME NAME, so a capability under a
different command name is invisible to it. That is how `drift` was missed.

## 2026-08-13 — todo63 closed, and one of my "not blocked" calls was wrong

**todo63 CLOSED.** The recall half is built: `pruneTaxonomy`'s ATOM edge gate now spares a node whose
`dna.isExported` is true, so an exported constant nobody imports keeps its node and `prune` reports
it. MEASURED on the frozen subjects — orchestrator 6,662 -> 6,715 nodes (+0.80%), sofie 10,545 ->
10,567 (+0.21%), scraper unchanged as the python control. Dangling counts identical, `located` still
100%: the cost is nodes, not broken references. Baselines re-saved warm and cold.

**todo58#P1 is NOT unblocked, and saying it was is my mistake.** I claimed ADR 0070 already decided
it — refuse and record as dangling. Two things were wrong. ADR 0070 forbids fabricating a target by
COINCIDENCE (a basename match that sent 106 importers to a test file); reading a declared `tsconfig`
`rootDir`/`outDir` is not that kind of guess. And the dangling option does not meet the acceptance
anyway: the unresolved reference is ALREADY kept as a dangling edge at 0.4, and on sofie **all seven
named symbols are still flagged**. The false verdicts sit on the TARGET file's symbols, and nothing
links "this importer did not resolve" to "do not call that symbol dead". Only resolving the specifier
removes them. It is a real decision again.

## 2026-08-13 — `context` measured, todo64 corrected, and a self-inflicted flake

**todo57#P1 answered.** Both `context` surfaces driven on `resolveSymbolId`, same vault, same moment.
They are not two renderings of one answer:

| | CLI | MCP |
|---|---|---|
| entries | **2,407** | 83 (of 103 in radius 2) |
| overlap by name | **44** | 44 |
| kinds | ATOM 1052, BEHAVIOR 649, `node` 247, STRUCTURE 244, UNIT 196, ECOSYSTEM 19 | BEHAVIOR 78, STRUCTURE 5 |
| source lines | yes | no |

The CLI side has a defect the static gate could not see: **2,407 entries for one symbol is a dump**,
247 of them unresolved `node` placeholders. The decision in todo57#P1 is still yours, but the CLI's
breadth is a bug regardless of which way it goes.

**todo64 is CLOSED, after carrying two wrong headlines on the way.** It said block 3b was unreachable
dead code; then, after a contaminated starve, that 3b was load-bearing. Both wrong — 3b instrumented
logs no rebinds at all, and starving it changes nothing.

The real cause, found by instrumenting the call processor: `context.localBindings` is keyed by name
per FILE with no scope, so `import { realTarget as shadowed }` made every `shadowed()` in the file
resolve to the import, including inside a function declaring its own. Fixed as IntraLinker block 3c.
It also corrects same-named locals across SIBLING functions — a python call in `_merkle_diff` was
bound to `_render_markdown.walk`.

**Two guards, each forced by a measurement catching the fix being wrong.** Ids are lowercased for
APFS (CONDUCKS-4), so the first cut rebound 37 python edges — `pathlib::Path` onto a local `path` —
reintroducing the same defect from the other side; names are compared case-sensitively now. And a
destructured import binding is ALSO a scoped node with a matching name and must not win, which the
prune-precision fixture caught by reporting three live symbols as dead.

**One flake capture was contaminated, by me.** `kinetic.test.ts` failed with
`Cannot find module .../build/src/lib/core/utils/mem-trace.js` — which reads as a harness race and is
not one. `npm run build` opens with `rm -rf build`, and it was run by hand while the suite was in
flight. It also refutes the theory it suggests: `maxWorkers: 1` makes the suite serial, so two suites
cannot rebuild over each other. **Never build or restore a source file while `npm test` is running** —
the integration suites spawn child CLIs that read `build/` live.

Three captured runs followed: **fail / pass / fail**, in two more suites. Run 3 was
`mirror serves the wave over HTTP` — `fetch failed` while the server HAD reported ready, so a
ready-vs-listening gap or a port collision, not slowness. It was also taken while this shell was
running `docs-lint`, which is exactly the kind of noise that makes a timing test meaningless. **Every
observation of this flake so far was taken while something else was running.** That has to stop
before any theory is worth writing down.

## 2026-08-11 — prune stopped telling users to delete imports their code needs

**todo63 Phase 0 + 1.** The const-value defect the new fixture found is TWO causes, not one, and the
single-cause theory in the todo is refuted — fixing either half leaves the other exactly where it was.

- **False positive:** a bare value read (`return usedValue`) produces NO edge, so the used-set never
  sees it. The analyzer HAS a guard for that blind spot, but it is keyed per (file, specifier) — so
  any used sibling from the same module lifts it. Splitting the import into two statements does not
  help; they merge into one record.
- **Recall miss:** entirely separate. An exported value nobody imports has no NODE at all —
  `pruneTaxonomy` cut it (ADR 0013). Nothing to flag. Left open as todo63 Phase 2, because reporting
  it is a taxonomy decision about what the graph stores, not a `prune` change.

Fixed by removing `variable` from `PRUNABLE_BINDING_KINDS` — one consumer, one line. Decided by the
analyzer's OWN written rule, not preference: *"a missed dead import is acceptable and a wrong one is
not"*. A const arrow function is `function`, not `variable` (measured), so callable coverage is intact.

**MEASURED on sofie: 171 findings → 161, `STALE_IMPORT` 20 → 10.** Three of the ten removed were
checked against the source and all three are confirmed false positives — `ALL_ROLES` used three times
in the file that imports it, `STATE_COLOR` used as an index, `OWNER_KEY` used as a call argument.
The cost is real and asserted explicitly in the fixture: a genuinely stale VALUE import is now never
reported. Trading it back is a visible choice, not an accident.

## 2026-08-11 — the prune precision check is a fixture now, and it found two things

**todo58#P2 done.** `tests/integration/features/prune-precision.test.ts` replaces a by-hand
measurement (172 findings verified one at a time, ~94.8% precision, unrepeatable) with a project
whose truth is DECLARED in the test. Scored on precision AND recall together, because either alone is
gameable. Four live symbols, four different mechanisms — static import, destructured dynamic import,
dynamic import then `new`, barrel re-export. Mutation-verified.

**It found a defect on its first run — todo63.** Exported const VALUES are wrong in BOTH directions:
an unused one is MISSED, and a used one is flagged `STALE_IMPORT`. Functions and classes are fine,
including an arrow function on a const, so it is the value and not the declaration form. The false
positive is the bad half — `STALE_IMPORT` is a verdict telling the user to delete an import their
code needs. Held in the fixture's `KNOWN_WRONG` group, which fails if the gap grows OR is silently
fixed.

**And a second thing — todo64, whose first headline was WRONG.** `IntraLinker` block 3b was filed as
unreachable dead code: starving it left 1,827 of 1,829 tests passing, both failures in the one test
that hand-builds the pre-fix graph. Checking the shadowing case corrected it. 3b is LOAD-BEARING — it
resolves calls through a renamed STATIC import (`import { A as B }` … `B()`), and starving it deletes
those edges. Every fixture that reached the first conclusion held a dynamic import and none held a
renamed static one.

What 3b actually has is a WRONG-EDGE bug: a genuine local declaration that shadows a renamed import is
rebound to the import, so `usesLocal` — which calls its own arrow function — is recorded as calling
the imported definition. Confidently wrong, and nothing counts it. todo64 carries the repro.

**A green suite while a path is starved proves the SUITE does not cover it, not that the path is
unused.** That is the lesson, and it cost a wrong claim in three files before the shadowing fixture
caught it.

## 2026-08-11 — todo59 closed, and the re-baselining confirmed todo62 independently

**todo59 closed.** Cold and warm now keep SEPARATE baselines — `<name>.cold.json` beside
`<name>.json`. Both modes wrote the same file before, so `--cold --save` silently overwrote the warm
baseline and `--cold --compare` diffed a first analyze against a second, reporting the residue as
DRIFT every run. Comparing across modes is now REFUSED (mutation-verified), and the residue is a
stored number instead of a rediscovery: **orchestrator 5 edges, sofie 1 node**. The docstring's
"cold and warm now agree" claim — asserted in prose, checked by nobody — is replaced with the truth.

**The warm baselines had to be re-saved, and the diff was not noise.** It is the todo62 alias fix
measured on frozen subjects, which nothing else could have shown:

| orchestrator | before | after |
|---|---|---|
| orphans | **23** | **0** |
| violations | 25 | 2 |
| nodes | 6,639 | 6,662 |

Every one of those 23 orphans was a binding node deleted by its own mis-named edge. scraper (python)
is unchanged — the control, since it has no destructured dynamic imports.

**And the driver swap had broken 26 files nobody tests.** `tools/` and `scripts/` imported `duckdb`
directly — including `npm run benchmark` and `health.mjs` itself — while the gate written the same
session reported `build/ clean`, because it scanned `build/src` only and matched `.js` alone. All 26
ported behind one helper (`tools/lib/vault.mjs`); the gate now covers `tools/`, `scripts/`, `.mjs`
and `.cjs`, allows devDependencies for tooling only, and ignores `require(...)` written inside a
comment. `tools/upstream-duckdb-repro/` still imports `duckdb` ON PURPOSE — it is a bug report about
that package.

**A THIRD intermittent test appeared:** `rename-safety.test.ts:84` failed in one full-suite run of
three and passes in isolation. That run reported two failing suites and only one was captured before
the output rolled. Filed as todo60 Phase 3, explicitly NOT attributed to the alias fix — 235/235
passed twice on the same build, so the counts cannot carry an attribution.

## 2026-08-11 — todo62: the edge was misnamed, therefore the node was deleted

**Closed.** The three surviving dangling edges were NOT re-exports — that first reading was wrong, and
the correction is the point. They are destructured dynamic imports
(`const { X } = await import(...)`), and the failure runs backwards from the intuition:

`processAlias` built the edge from the bare local name (`<file>::doit`) while the binding node is
stored scoped to its enclosing function (`<file>::main2.doit`). `pruneTaxonomy`'s ATOM gate keeps a
node only when an edge's endpoint IS that node — so the mismatch made the binding read as
unreferenced and **the edge's own misnaming is what deleted its node**. Prune's edge cleanup then
missed the edge for the same reason. A module-level re-export has no scope, the two ids coincide, and
57 of 60 alias edges were always healthy — which is why only the scoped minority was ever broken.

Fixed at both call sites in `reflector.ts`. Measured after a full re-analyze: dangling confident
structural edges **3 → 0**, alias edges still 60, the 1,044 deliberately-unresolved untouched. The
structural test's carve-out is gone — it asserts `[]`. Rule promoted into CONDUCKS-28.

**`CONDUCKS_SQL_LOG` is what ended it.** Three rounds of plausible reasoning about which deleter ran
were all wrong; the write log put the node's id and the edge's endpoint side by side in one line. Use
it before theorising about what a pulse wrote.

## 2026-08-10 — the two surfaces must answer the same question

ADR **0148**: every MCP tool is a CLI command, not the reverse, and where both exist they mirror —
same input, same ANSWER, differing only in rendering. Twelve capabilities live on both surfaces and
nothing had ever said what their relationship was, so they drifted silently.

Closed: `trace` gained `--mode`/`--target` (its `path` mode was unreachable from the CLI), `prune`
gained `--type`/`--limit`, `flows` gained `--min-members`/`--limit`, `coverage` gained `--limit`, and
`impact`'s CLI stopped reading an unknown direction as upstream. Each verified against sofie rather
than asserted — `prune --type ORPHAN` gives 17 from both surfaces, `flows --min-members 2/5/10` gives
1126/635/376 from both.

**The find that mattered most: `conducks_rename` wrote to disk by default.** Its schema declares
`dryRun: { default: true }`, but a JSON Schema default is documentation — the server does not inject it
— so an omitted value reached a parameter defaulted to `false` one layer down. The only destructive
tool on the surface mutated source while advertising that it would not, and the CLI had always been
safe. Anything other than an explicit `dryRun: false` is now a dry run.

`audit` was reported as a gap and was not: comparing parameter lists against `usage` strings sees
absence where comparing CAPABILITIES sees a different layout (`advice` is `conducks advise`). State a
gap as a question a user cannot ask.

## The laptop stops overheating, and here is why it did

`analyze` sizes its worker pool at `os.cpus().length - 1` — 11 workers on a 12-core machine — and the
suite spawns `analyze` many times. Measured on sofie: 11 workers analyzes in 20s, 4 in 23s. A 15%
wall-clock cost for a third of the load, so tests now cap it at 4 (`tests/helpers/cap-workers.mjs`,
`CONDUCKS_WORKERS` overrides).

The bigger half was behavioural and it was mine: ~25 full-suite runs at 4 minutes each to chase one
flake, which also produced a WRONG conclusion along the way. `npm run test:fast` exists so the inner
loop is 26s. See AGENT_RULES.

## The board is EMPTY, and here is what that does and does not mean
That sentence was true on 2026-08-09 and is not now. Six todos are open, and every one was filed FROM
measurements taken after the board said it was empty:

- (closed today) `todo56` — the install. See above; four platforms measured.
- `todo57` / `todo61` — `context` is two features under one name; needs the BFS extracted to the domain.
- `todo58` — build-layout specifiers: an unresolvable path should inflate DANGLING, not read as dead.
- (closed today) `todo59` — cold/warm parity. Residue tracked in a cold baseline, not chased.
- `todo60` — now THREE intermittent tests; the assertions print their values, so the next natural
  failure diagnoses itself.
- `todo61` — the mirror rule: five gaps closed, `status` and `diff` need a decision.
- `todo63` — the false-positive half is FIXED (above); Phase 2 remains, and it is a taxonomy
  decision: should an exported-but-unreferenced value keep a node at all?
- `todo64` — `IntraLinker` block 3b rebinds a local that SHADOWS a renamed import to the import: a
  wrong edge. It is load-bearing, not dead — an earlier note here said dead and was corrected.
- (closed today) `todo62` — the alias id-shape bug. See above.
  call, not work: is a barrel re-export a symbol or a relationship?

And the ones that are not tracked as open work:

- `todo16` — npm publish. Everything gating it is green; the publish itself is Said's command to run.
  Note what changed today: the package it would have published was BROKEN (undeclared `minimatch` and
  `chalk`), and the repo could not see it. Pack and install the tarball before publishing, every time.
- `todo31` — parked with reopen-triggers. NOTE: its `Status:` is `todo` with zero unchecked tasks, so
  the board cannot show it. That is a real blind spot in the grammar, flagged twice and not yet
  resolved — a file that says "todo" and appears nowhere.
- (closed 2026-08-09) `todo55` — `watch` missed files created in the first moment after startup,
  ~1 run in 3. Cause: the command never awaited chokidar's `ready`, so it reconciled and printed
  "Live Mirror Mode active" while the poller had no baseline. Fixed by awaiting it; 20 clean runs,
  mutation-verified.

## 2026-08-08 — the agent-facing surface, and what it cost
The CLI walk had been the whole story. Pointing the same method at the MCP surface — driving tools the
way an agent does rather than reading them — produced **eight defects in eight attempts**. Every one of
them returned a payload beforehand, which is the bar that keeps proving worthless.

The two that matter most, because both produce WRONG ANSWERS rather than errors:
- **Pipelined calls raced the shared registry.** `ensureGraphLoaded` cleared `pendingLoad` before
  awaiting the load, so a second caller walked an empty graph and reported `SYMBOL_NOT_FOUND` for
  symbols that exist. It did not throw — it answered. ADR 0146.
- **`conducks_prune` with an unknown `type`** returned `{ORPHAN: 0, UNUSED_EXPORT: 0, STALE_IMPORT: 0,
  total: 0}` — a clean bill of health for the whole codebase, from a typo.

Also fixed: `watch` was blind to files created after it started (`git diff HEAD` prints nothing for an
untracked path — todo51), `diff` had the SAME blind spot in the PR risk engine, `status` reported an
empty vault as `READY`/`SYNCHRONIZED` (`status: 'ready'` was a string LITERAL in both status functions),
the MCP payload dropped that verdict entirely, and `conducks_rename` told the agent to run
`conducks_analyze`, a tool that does not exist.

## The recurring class, now enforced rather than written down
17 of 132 memory entries were ONE defect: nothing examined reported as a negative finding. ADR 0124
stated the rule in prose and it was violated eight more times, because a principle cannot bind dozens
of independent render sites and a grep cannot tell a lying branch from an honest one.

ADR 0145 moves it to the compiler. `Verdict<T>` in `contracts/verdict.ts`: `clean` cannot be
constructed without `examined`, `nothing-to-check` is its own variant, and `renderVerdict` switches
with no default — adding a fourth variant fails the build (verified by adding one, TS2366).
**Migrated: `advise` only.** The others turned out not to need it — their empty case was already a loud
refusal, now translated at the single CLI error boundary instead of leaking the internal guard.

## 2026-08-09 — the MCP surface walked to the end, and the queue removed
`todo53` drove all 14 tools and all 9 enums over real stdio JSON-RPC: **25 defects**, every one behind
a payload that looked fine. The recurring shapes, each now fixed at source rather than per tool:

- **A `::` id was never checked against the graph.** An invented symbol made `trace`, `impact`,
  `explain` and `context` answer "0 steps / 0 impact / 0 in radius / no risk fields" — four confident
  nothings. One `resolveSymbolId` in `shared/resolve-symbol.ts` now verifies the node exists.
- **A bound declared in `inputSchema` was a comment.** `radius: "two"` made `Math.min("two", 10)` NaN,
  which removed the depth guard entirely and produced the WIDEST possible walk from a junk value.
  `numErr`/`boolErr` join `enumErr`; bounds live in one constant the schema and the guard both read.
- **Denominators.** `flows` published the pre-filter total, `docs` reported health over a project with
  no `docs/`, `coverage` answered `{total: 0, dark: 0}` for a report matching nothing. `coverage` and
  `docs` now carry `Verdict`; `flows` reports `matching`.
- **`query` advertised a template it then refused** (`type_coupling`), and the refusal told the caller
  to consult the list that had just advertised it. The allowlist is now ASKED of the library.
- **`diff` reported 0 impacted symbols** while the CLI reported 7 on the same tree at the same moment —
  a private copy that had received neither of the CLI's two fixes, plus a matcher reading a cyclomatic
  count as a line span. One engine now (`change-set.ts`), reached through the registry.

`todo52` then removed ADR 0146's serialisation. ADR **0147** supersedes it and carries the correction:
0146 blamed the handle swap, and reverting each fix singly proved the swap caused NEITHER failure.
`pendingLoad` cleared on every call caused the wrong answer; `tool-registry` closing the shared handle
uncounted caused `Database was already closed`. The handle now has ONE owner —
`registry.infrastructure.acquireVault/releaseVault`. Probe: **2,135 ms → ~500 ms**.

## Traps for the next session
- Frozen benchmark subjects (`test-projects/{scraper,orchestrator,sofie}`) take NO commits, ever.
  `tools/benchmark/health.mjs --compare` is the drift gate; analyze always `--force`. `--cold` now
  exists and measures the FIRST analyze — the default baseline describes the second.
- **A check written after its fix must be seen RED first** (`npm run cli:mutate`). Every fix this
  session was mutation-verified, and two earlier checks were vacuous when mutated.
- **A test must never re-implement what it tests.** The SQL guard's multi-statement hole survived in
  both the guard and its replica. Export the real function and call it — `sqlGuardReason`, `enumErr`.
- **A mocked handler has no shared singleton to corrupt**, which is why every unit test passed while
  pipelined calls were returning wrong answers. Concurrency needs the real server over stdio.
- `tools/mcp-parallel.mjs` is FIXED and can now be read as correctness: it parses the tool payload,
  counts an in-payload `error` as a failure, drives six DIFFERENT tools, and exits non-zero. It is
  mutation-verified against a symbol that does not exist (`PROBE_SYMBOL=noSuchSymbolAnywhere` gives
  `ok=2 failed=4`, where the old test scored all six `ok`).
- **When several fixes land for one symptom, revert each ONE AT A TIME.** Three landed for the
  concurrency races and the obvious story was wrong — the ADR amendment written before the mutations
  credited the wrong fix and had to be corrected. ADR 0147 carries the cause table.
- **The architecture gate is load-bearing.** `boundaries.test.ts` blocked three separate attempts on
  2026-08-09 (`cli -> domain` twice, `mcp -> domain`, `composition -> mcp`). Each time it was right and
  pointed at where the shared code actually belonged — the registry, not the interface layer.
- The stamp gate WILL flag your edits: touching a file cited by a module note prints a re-read flag.
  That is it working — re-read, then `visuals-lint --stamp <page>`. Do not bulk-stamp. Twice this
  session the flagged anchor had genuinely drifted (one by ~57 lines, hidden until an unrelated edit
  changed the file's hash).
- `blocking-commands.test.ts`'s reaction case does NOT flake on CPU load — that note was wrong and is
  now todo55. Measured 2026-08-09: ~1 failure in 3 running it ALONE. Do not widen the window and do not
  move it to a serial project; both were tried as theories and the measurement disproves them. The
  `docs-watcher` debounce case WAS a genuine test-timing bug (a fixed 600 ms sleep, asserting before
  the debounce fired) and is fixed — it now waits on the condition and then proves the count stays 1.
- sofie (`assistant/sofie`) sits ~96 commits ahead of origin, unpushed by decision — Said's call.
- `.conducks/note-reviews.json` is COMMITTED (the one carve-out from the ignored vault dir).

## What the earlier stretch built (read the ADRs, they carry the reasoning)
- **The visuals pipeline** (ADR 0138–0142): anchors checked against the working tree; drift proven by
  re-running the repo's DECLARED generator with a restore contract; module notes are SOURCE at
  `docs/visuals/modules/<path>.md`; review stamps hash the exact cited span.
- **conducks arch** finished ADR 0134's program: doors, composition root, layer direction, per-service
  monorepo verdicts, cluster shape.
- **Adoption is one command**: `conducks setup` installs skills, MCP, registry, ignore file and the
  pre-commit gates; skills re-sync on every build.
- **trace/context tell dependency from co-location** (todo38); `context` opens with the symbol's
  callers and their call-site lines.
- **The id re-case was decided AGAINST by measurement** (todo32).

## If you pick something up
`todo53` is the highest-value: the MCP surface has yielded a defect every single time it has been
driven, and roughly half of it is still unwalked. `todo52` buys back the 8×. The deferred canvas→note
link map in sofie and the DERIVED-header warn→error raise remain, neither urgent.
