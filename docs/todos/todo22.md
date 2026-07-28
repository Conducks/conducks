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
- [ ] `conducks guard` detects real violations and NOTHING runs it. Not `.github/workflows/main.yml`, which runs `analyze` then `npm test`; not `scripts/hooks/pre-commit`, which runs `docs-lint` only. Verify with `grep -n guard .github/workflows/main.yml scripts/hooks/pre-commit` — no hits today
- [ ] `guard` currently exits 1 on this repo: 3 illegal layer PAIRS (`cli → core`, `cli → domain`, `mcp → domain`), which the graph shows as 47 individual edges. So wiring it into CI turns the build red until the edges are routed through `registry` — decide whether to fix first or gate first, and say which here
- [ ] `guard.ts:40` exits on the first layer violation before reaching the summary at `guard.ts:44-52`, so a reader never learns whether 0 or 40 other findings sit behind it. A gate that hides its own scope cannot be trusted to have checked everything
- [ ] `docs/architecture.md:62` says `- Enforced by: tests/unit/domain/governance/layer-contract.test.ts`. That test audits a SYNTHETIC graph against the default ruleset and deliberately uses a nonexistent root to stay isolated from this repo. It cannot catch a live violation, and three exist. Either something checks the real repo, or that line must stop claiming it does

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
- [ ] `docs-board.ts:492` excludes `superseded` from the no-build-link warning but not `- Resolved by:`. ADR 0012 is `Status: Accepted` with `- Resolved by: 0013`, so it is reported as unlinked on every run and always will be. Verify with `conducks docs-status | grep "no build link"` — it names 0012 today. A permanent false positive trains the reader to skip the line, which is the same failure as the untriaged findings in Phase 3
