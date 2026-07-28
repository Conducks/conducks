# todo22 — the gates that do not run, and the claims that are not true
Status: todo
- Acceptance: every rule this repo declares is evaluated by something that runs automatically, and no doc claims an enforcement that does not happen.

## Context

Conducks exists to catch structural decay, and its own decay gates are either unrun or misdescribed.
None of this is new work discovered by building something — it is what an audit of the open board
found already true today, recorded because it was known and written nowhere.

The pattern is one this project keeps repeating and has a rule against (CONDUCKS-13): a check that
silently evaluates to nothing, and reports success. Seven shipped features have had that shape. These
are the same shape at the level of the gates themselves.

## Phase 1 — the layer contract is violated and nothing looks
- [x] Test files are outside the contract, decided while fixing this. A unit test imports the unit it tests, so `tests/unit/interfaces/tools/filter-builder.test.ts` classified as `mcp` reaching `domain`. Routing those through the registry would turn every unit test into an integration test — a worse codebase bought with a greener gate. Pinned from both sides in `layer-contract.test.ts`: a test file is exempt, and production code merely named `test-runner.ts` is not
- [x] `conducks guard` detects real violations and NOTHING runs it. Fixed 2026-07-28: `.github/workflows/main.yml` gains an `Enforce Layer Contract` step directly after `analyze`, because guard reads the graph that step writes and would otherwise gate a stale one. The pre-commit hook deliberately does NOT run it — a hook cannot afford a full re-analysis, and that is stated in both files. Verify with `grep -n guard .github/workflows/main.yml`
- [x] `guard` exited 1 on 3 illegal layer PAIRS. DECIDED: fix first, then gate — a CI that ships knowingly red trains people to ignore it, which is this todo's own failure mode. 11 imports across 9 files now route through `registry`; the filter vocabulary (`FilterValidationError`, the limit constants) moved to `contracts`, which every layer may import, because both sides must name it. Verify with `conducks guard` — layer contract clean
- [x] `guard` exited on the layer violation before printing the other-findings summary, so the reader who most needed the full picture — the build is already red — was the only one who never saw it. The summary now prints first. Verify: `conducks guard` reports `rank_violations=421` whether or not the contract holds
- [x] `architecture.md` claimed the layer contract was enforced by a test that audits a SYNTHETIC graph and cannot see this repo. `- Enforced by:` now names the CI step that runs guard on the real graph, and the paragraph says plainly what that test does and does not cover

## Phase 2 — two rule engines share one name
- [ ] `sentinel-rules.ts` (`SentinelRule`, `auditWithRules()`) and `config/sentinel.json` are unrelated mechanisms with the same word. `guard` evaluates the first (layer boundaries, cycles, rank); `audit` evaluates the second (heritage, export, fan-out, file presence). Neither evaluates the other's rules, and nothing says so
- [ ] A reader told "audit found violations, go fix them" has no way to know fixing them does nothing for the layer contract. Name the two, in `memory.md`, with which command runs which
- [ ] Decide whether they should stay separate. If they merge, one command reports everything; if they stay, the names must stop colliding

## Phase 3 — findings that are now visible and unowned
- [ ] 8 `domain-visibility-rule` violations fire since the config was corrected: file-local interfaces under `domain/` that the rule says must be exported (`docs-board.ts::PhaseLike`, `watcher.ts::WatcherOptions`, `update-check.ts::CacheFile`, and 5 more). Either the rule is too broad for function-scoped helper types, or these are real. Decide which — leaving them standing trains the reader to ignore the channel
- [ ] ~50 `require-conducks-component` violations also fire and were never triaged. Same decision
- [ ] `AuditResult.status` declares `INSUFFICIENT_DATA` at `audit-service.ts:90` and never returns it, so the branch at `audit.ts:30` is unreachable. It becomes reachable only when drift works (todo20#P4) — until then it is dead code that reads as handled

## Phase 4 — the board cannot see a PARTLY claimed decision
- [x] ADR 0035 states that a project without git degrades to today's conducks: one flat graph, no layers, nothing broken. The only task proving it sat in todo21 under a phase tagged `- Builds: 0036`, so 0035 had a consequence no phase claimed. Moved into `todo20#P2`, which builds 0035
- [x] ADR 0034 states that the parked tasks in todo01, todo07, todo09 and todo16 move to `[>]` or `[-]` with reasons. Only todo09 was migrated, and no todo declared `- Builds: 0034`. Fixed 2026-07-28: todo07 and todo16 migrated, todo07 declares the link
- [ ] Both of the above were found by hand, and the board could not have found either. `docs-board.ts:417` sets `buildState` from the linked phases alone: `unlinked` when none link, `built` when all linked phases are done. An ADR with five consequences and one phase covering one of them reads `built` the moment that phase finishes. The check answers "did anyone claim this decision", never "is all of it claimed"
- [ ] This is CONDUCKS-13 at the level of the docs graph: a check that evaluates to nothing and reports success. It is the reason this happened twice in two days and both times a human caught it
- [ ] Deciding what "covered" means is the hard half and it is not obvious — `## Consequences` is prose, not a list, and no regex maps a paragraph to a phase. Candidates: require each consequence to be its own `-` bullet so they can be counted and stamped; or have the ADR name the phases that carry it, so an unnamed consequence is visible. Decide which before building either
- [x] The standard itself is the one document nothing checks, and it drifted from the parser it describes. ADR 0034 widened `RE.task` to `[ xX>-]` and made a reasonless `[>]`/`[-]` fail lint; the standard went on documenting two states and used `[-]` without defining it. Fixed 2026-07-28, and the cheap half is now automated: `tests/unit/domain/analysis/docs-standard-citations.test.ts` fails when a `conducks-docs §N` citation in the repo resolves to nothing, or when a heading in the standard carries no number. It found two citations already wrong — `docs-grammar.ts` and `docs-lint.ts` both said "§4 grammar" after the grammar moved to §5
- [ ] The test covers citations and headings only. Drift between the standard's PROSE and the parser's behaviour — a lint rule the code enforces and the document never mentions — is still caught by a human or not at all, and that is how five gate rules went unlisted until 2026-07-28. Decide what else is mechanically checkable: the marker set against `MARKER_TO_STATE`, and `ROOT_ONLY`/`DERIVED_FILES` names appearing in the gate lists, are the two candidates worth costing
- [ ] `docs-board.ts:492` excludes `superseded` from the no-build-link warning but not `- Resolved by:`. ADR 0012 is `Status: Accepted` with `- Resolved by: 0013`, so it is reported as unlinked on every run and always will be. Verify with `conducks docs-status | grep "no build link"` — it names 0012 today. A permanent false positive trains the reader to skip the line, which is the same failure as the untriaged findings in Phase 3

## Phase 5 — analyze runs out of memory on ordinary projects
- [ ] `conducks analyze` FAILS on 2 of 3 real projects benchmarked, producing an empty vault and a non-zero exit. Measured 2026-07-29 on copies of `assistant` (554 source files) and `reference-project` (2948): both die, `mentorseed` (660) survives, so it is not a simple file count. Reproduce by analyzing a fresh copy of a project that size and checking `SELECT count(*) FROM nodes` — it is 0
- [ ] The root cause is one transaction around the whole pulse. `beginPulse()` opens a transaction that is only committed by `save()` at the very end, so DuckDB must hold every uncommitted row PINNED in memory for the duration. It exhausts its default budget — 80% of RAM, 19.1 GiB on a 24 GB machine — during the DISCOVERY flush, before wave 1. Setting `memory_limit` was tried and does not fix it: at 2 GB it fails identically with "failed to pin block (1.8 GiB/1.8 GiB used)", because pinned pages cannot spill
- [ ] The error a user sees names the wrong cause. The OOM is logged once for the discovery pass, then the aborted transaction makes every later wave report `TransactionContext Error: Current transaction is aborted`, and THAT is what the CLI prints as the fatal error. Anyone debugging this starts on transactions and never reaches memory
- [ ] Decide the tradeoff, because the one-big-transaction is deliberate and documented: it is what makes an interrupted analyze roll back so the previous good graph survives instead of a silent partial graph. Per-wave commits would fix the memory and give up that guarantee; a savepoint per wave, or writing to a sibling vault and swapping (the ADR 0037/0040 mechanism), might keep both. Measure the memory of each before choosing

