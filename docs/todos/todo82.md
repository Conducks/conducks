# todo82 — make a full analyze and a CLI query fast
Status: doing
- Acceptance: a forced full analyze of conducks finishes in under 10 s with a warm blame cache and a CLI query in under 0.3 s; the stored history, blame and kinetic columns, nodes, edges and query answers match a pre-change graph, except the one history difference recorded under Phase 1.

Context: measured 2026-11-11 on code-only 0cd30d6 (machine load 4–6 on 12 cores, so every number is rough). A forced full analyze takes 40 s wall, 47 s user and 200 s sys, with 416k involuntary context switches. Wave 1 takes 5 s for 500 files and wave 2 takes 25 s for 500. With `CONDUCKS_WORKERS=0` the same run takes 73 s, and the CPU profile puts 79% of it in `spawnSync`: per file, `getFileHistory` runs `git log` (30.7 s) and `getBlameData` runs `git blame` (27.1 s); tree-sitter parsing is about 1.2 s. An incremental analyze is already fast (3.8 s on main). A CLI query takes 0.9 s whatever it asks; `load` plus `addNode` (the whole graph read from DuckDB) is 0.57 s of it. Comparable tree-sitter indexers report about 4 s for a 520k-line repo (self-reported), so the gap looks like git and loading, not parsing. Work happens in worktree `../conducks-speed` (detached at main cf4712e), staged and not committed, by the owner's word (2026-11-11). Not in the main checkout, because about ten live MCP servers run from its `build/`.

Who must not break: conducks `watch` keeps every initialised project's graph live. It holds that project's DuckDB open and writes on every save (`src/lib/domain/evolution/watcher.ts:323`, `:394`), and each save re-parses the file through the same git block, so it runs one `git log` and one `git blame` per save today.

What blame feeds, checked in code 2026-11-11: per symbol `primaryAuthor`, `authorCount`, `lastModified` and `tenureDays` (`reflector.ts`, the git block). The orchestrator stores `tenureDays` as `nodes.blame_age_days` and `primaryAuthor` as `last_author` (`orchestrator.ts:279`). `query-service.ts` filters `dead_code` and `high_risk_dead_code` on the age in SQL (`:155`, `:182`), shows it in `unused_exports` (`:117`), shows the author in `hotspots` (`:346`), and reads the columns at `:446`. Not yet traced: `adjacency-list.ts:150`, the `conducks_graph_query` tool, the web mirror and `graph --at --json`. Blame runs on the working tree, so a line not yet committed gets the zero hash, author `not.committed.yet` and time "now".

Decision (owner, 2026-11-11): keep the stored columns and their meaning; change only how they are filled. Computing blame at query time was rejected because queries would then write to the database the watcher holds open, and the age filters would leave SQL.

Anchors: `src/lib/core/parsing/reflector.ts::reflect` (the git block, "Ingest Kinetic Git Signals") · `src/lib/core/git/chronicle-interface.ts::getFileHistory`, `::getBlameData` · `src/lib/domain/analysis/worker-pool.ts::run` (fixed chunks, one per core) · `src/lib/core/parsing/pulse-worker.ts` · `src/lib/core/persistence/persistence.ts::load`.

## Phase 0 — measure the ceiling
- [x] Time a forced full analyze with default workers and the git block off. Measured 2026-11-11 in the worktree at load 3–6: 43.4 s with git, 13.1 s and 13.3 s without; sys time 226 s against 1.8 s. Git is about 30 s of the gap and all of the kernel time. The other 13 s is a second weak link (target under 10 s), still to be profiled.

## Phase 1 — one git log per repo, not one per file
- [x] Build file history once per repo before the waves with `git log --format=%x1e%H%x1f%ae --name-only -z --diff-merges=combined --no-renames`, and hand each worker the entries for its chunk. A file without an entry, or an unprimed process such as the watcher, keeps the per-file `git log`.
- [x] Equality, measured 2026-11-11 with `histcheck.mjs` against per-file `git log --format=%ae -- path`: conducks 1,188 files, 1 differs; agent-gateway 905 files (every 4th), 0 differ. Without `--diff-merges=combined` merge commits are missed; without `--no-renames` the commit that renamed a file away is missed. The 1 difference is `src/resources/skills/conducks-docs.md`: commit b68788f sits on a side branch that git's per-file history simplification hides, and the repo-wide log counts it (45 against 44). Accepted as equally true.
- [x] Check, 2026-11-11: forced full analyze 43.4 s → 28.5 s and 28.4 s (sys 226 s → 98 s). Every git-derived field on all 9,783 baseline nodes is identical (`compare.mjs`); no node is missing. 58 edges changed, all `CALLS` to `.set`/`.entries`/`.add`: 44 come from the 3 edited files, the rest are member calls in unedited files that now resolve to `global::set` or `global::map`. Two runs of the same code give identical graphs, so the resolver's member-call matching depends on which symbols exist elsewhere; that is a resolver weakness, not this change. `tests/unit/core/git/history-index.test.ts` plants a hand-edited merge and a rename; it fails without either flag. Related suites in one run: 125 suites, 1,047 tests, green after rerunning one suite that lost a build race (trap below).
- [x] Incremental analyze after touching one file: 3.6 s and 2.3 s (was 3.8 s). Not taken: a new CPU profile.
- Trap: `tests/integration/features/helpers.ts` runs `npm run build` when `build/` looks stale, while other suites in the same run use `build/`. A run that starts with a stale build fails with `Cannot find package '@/lib'`. Build first, then run the tests.

## Phase 2 — cache blame by file version
- Depends: todo82#P1
- [x] Before blaming, look up a cache entry keyed by repo-relative path, the hash of the file's commit list from Phase 1, and the hash of the file's working content. A hit skips `git blame`. Store only results with no uncommitted line, so a dirty file keeps today's "now" timestamps. The cache lives under `.conducks/`, which is gitignored.
- [x] Check, 2026-11-11 (load 6–9): forced full analyze cold 29.2 s and 28.1 s, warm 15.0 s, 14.0 s, 13.9 s. A `git` shim counted the warm run: 1 repo-wide `log`, and blame only for files edited in the worktree. Every git-derived field is identical cold against warm. Tests in `history-index.test.ts`: a cache hit returns the stored entry; an edited file is blamed fresh and not stored; each fails when its guard is removed.
- [x] Fixed after review: `buildHistoryIndex` looked for `.git` from the project's parent, so a project nested in another repo got the outer log (test added, fails without the fix). The uncommitted-line check read source text too, so a file containing 40 zeros, `read-ref.test.ts`, was never cached; it now matches porcelain header lines only.
- Cold floor, measured: blaming all 684 tracked source files with plain `git blame` takes 15.7 s at 10-way and 28.0 s at 1-way (sys 97 s at 10-way). On a fresh clone blame itself is the cost, not how it is spawned; a parent-side pool would not help. Only a one-pass blame over history would (gitoxide's incremental blame is the reference); UNMEASURED and its output must equal `git blame`'s.

## Phase 2b — one pass to apply linker results in memory
- [x] `retargetEdge` scanned every edge per id, and analyze applied 5,535 of them (3.0 s); the watcher paid the same per save. Replaced by `ConducksAdjacencyList::retargetEdges`, one pass for the list, at all 3 callers (`domain/analysis/index.ts` twice, `watcher.ts`). The step fell to 1.9 s; what is left is `updateEdgeTargets`' per-row UPDATE, kept per row because batching it hits the DuckDB duplicate-key bug its comment records. Graph changes are only in the edited files. `tests/unit/core/graph/retarget-edges.test.ts` fails when the id lookup stops lower-casing.
- Related suites after Phases 1, 2 and 2b, one run on a fresh build: 160 suites, 1,278 tests, green.

## Where the warm 14 s goes (2026-11-11)
- Parse waves about 4.4 s. Each wave spawns one fresh node process per core: wave 1 took 1.0 s for 500 files and wave 3 took 1.0 s for 182, so roughly 0.8 s per wave is fixed start-up.
- Graph inserts about 3.7 s, timed per flush: nodes 2.0 s for 13.4k rows, edges 1.7 s for 41k; existence probes and updates under 0.5 s together.
- Linker 1.0 s, its per-row vault update 1.9 s, ranking and the rest about 1.5 s.

## Phase 2c — what an agent pays per MCP call
- [x] Measured 2026-11-11: an MCP call answers in 15–40 ms once the server holds the graph (the first call about 400 ms), so for agents the cost is tokens, not time. The tool list was 4,947 tokens (chars/4, no tokenizer run).
- [x] Answers: every node carried its path three times (absolute `id`, `short_id`, absolute `file`) in indented JSON. `mcp-response.ts::formatAnswer`, used by all 13 tools, cuts the project root from every string (stated once as `meta.root`), drops `short_id` when it equals the shortened id, and writes compact JSON. Seven sample calls: 13,642 → 6,646 tokens (`context WorkerPool` 7,497 → 3,436). Nothing is lost: `tryResolveSymbol` accepts a relative id, and a path outside the root stays absolute. Tests in `mcp-response.test.ts`; the case-insensitive cut fails its test when broken.
- [x] Lists of 3+ items sharing one flat key set (values primitive or arrays of primitives) are written as `{cols, rows}`, and the code-layer tag says so. Same 12 calls: 13,238 → 10,766 tokens, so 25,501 → 10,766 overall (−58%). Undoing the table step on the new answers gives the old build's answers exactly, all 12 tools.
- [x] Tool list: the layer tag repeated on every tool was cut to one sentence that keeps the concurrency warning `docs-layer.test.ts` requires. 4,947 → about 4,440 tokens.
- [ ] Not done, by choice: merging tools or renaming them. shelfthings (decisions 0045, 0046) cut 71 → 56 tools and found merged names broke every caller; conducks' tool names are cited by the installed skills and client configs across the owner's machines, so a merge waits for a caller census and the owner. `conducks_docs` (757 tokens) leaves with the `code-only` branch.

## The 13 MCP tools, ranked for an agent (2026-11-11)
Ranked by how often an agent needs the answer to change code safely; tokens are the definition size after Phase 2c, and the answer sizes are from one sample call each, before → after `formatAnswer`.

| rank | group | tool | definition | sample answer |
|---|---|---|---|---|
| 1 | change safety | `conducks_impact` | ~360 | 3,322 → 1,660 |
| 2 | find | `conducks_query` | ~630 | 299 → 170 |
| 3 | understand | `conducks_context` | ~450 | 7,497 → 3,436 |
| 4 | understand | `conducks_trace` | ~400 | 1,195 → 654 |
| 5 | understand | `conducks_explain` | ~160 | 167 → 129 |
| 6 | health | `conducks_status` | ~240 | 149 → 115 |
| 7 | change safety | `conducks_diff` | ~220 | 627 → 316 |
| 8 | health | `conducks_audit` | ~285 | 3,050 → 1,583 |
| 9 | understand | `conducks_flows` | ~285 | 4,263 → 1,923 |
| 10 | find | `conducks_graph_query` | ~165 | 37 → 21 |
| 11 | health | `conducks_prune` | ~280 | 4,826 → 3,170 |
| 12 | health | `conducks_coverage` | ~265 | 69 → 61 |
| 13 | docs | `conducks_docs` | ~720 | leaves with `code-only` |

- Same content before and after, checked 2026-11-11: each new answer equals the old answer passed through `formatAnswer` for all 12 code tools (25,501 → 13,238 tokens), and 45 CLI answers (`impact`, `trace`, `explain` on 15 symbols) are byte-identical between the old main build and this one on the same graph.
- [ ] Merge proposal for the owner, not done: `graph_query` into `query` (a `sql` mode), `explain` into `context`, and `prune` + `coverage` + `audit` into one health tool with an `action`. 13 → 8 tools, roughly 1,200 fewer definition tokens (estimate). Needs a census of every skill, config and doc that names a tool first.

## Phase 2d — a CLI query stops compressing every node
- [x] Each CLI call loads the whole graph and `addNode` deflated every node's non-skeleton properties: about 160 ms of zlib in a 0.9–1.1 s query. Meat is now kept as the same JSON snapshot and compressed in batches of 500 two seconds after ingest goes quiet, on an unref'd timer, so a CLI call exits first and a long-lived MCP or watch process still ends compressed. CPU profile of `impact`: 1.47 s → 0.90 s; zlib is gone from it. `tests/unit/core/graph/lazy-meat.test.ts` checks the snapshot survives compaction and a caller's later mutation; it fails when compaction never runs. Related suites: 161 suites, 1,279 tests, green.
- What is left in a CLI query: reading 16.7 MB of `metadata` JSON for 9.8k nodes (string decode about 140 ms, parse about 110 ms, GC about 100 ms). About half of that JSON repeats columns stored beside it (`id`, `filePath`, `parentId`, `unitId`, `namespaceId`, `layer_path`). Not storing the copies would shrink every load and the vault; it changes the write format, so it needs its own phase and a vault migration check.

## Accuracy oracles after this work (2026-11-11)
- [x] The gate's oracle and bench chain, without its build and full test steps: 36 of 41 pass on the three test projects. `oracle:imports:app` fails the same way on the old main build (tsc does not run there: a test-project setup fault, not conducks). The 4 `self` oracles key their baseline by folder name, so they found none in a worktree called `conducks-speed`.
- [x] Self oracles in a worktree named `conducks`, old code then new: identical on all 7. Both failed `recall-ts`: 516 missed calls in the 2026-08-29 baseline, 2,905 now. Cause: `tools/benchmark/ts-program.mjs` counted calls inside `src/interfaces/web/mirror/public/vendor/*.min.js`, two minified libraries (7 lines, 2,592 calls) that analyze ignores by default (`**/vendor/**`). The oracle's walk now skips `vendor` too. Self recall is 96.8% (351 missed, better than the baseline), and sofie, orchestrator and scraper are unchanged. All 7 self oracles pass.

## Memory (2026-11-11)
- [x] Peak RSS of a forced analyze is 1.3–1.5 GB for a 10k-node graph. `CONDUCKS_MEM_TRACE=1`: native memory jumps by about 250 MB when the vault opens (t=0.6 s, DuckDB's own) and by about 270 MB during the linker step, where `updateEdgeTargets` runs 5,565 single-row UPDATEs inside the pulse transaction (the per-statement transaction-local storage `insertBatched` documents).
- [x] Wave size: 2,000 files per wave against 500 saves about 0.4 s and costs about 120 MB more peak memory (two runs each, load 7–10). Left at 500.

## Phase 2e — refuse unknown tool arguments, batch the linker's vault update
- [x] An argument a tool's schema does not name was ignored: `conducks_query {"query": ...}` (the name is `q`) answered with the top-ranked symbols as if they matched, and the symbol tools said "symbol must not be empty" without naming the wrong key. `tool-registry.ts::handleRequest` now refuses it with `UNKNOWN_PARAMETER` and the accepted names, before the handler runs. Every example call in the shipped skills uses valid names (checked). `tests/unit/interfaces/tools/unknown-parameter.test.ts` fails when the check is removed.
- [x] `updateEdgeTargets` is batched again (`UPDATE ... FROM (VALUES ...)`); the duplicate-key failure that kept it per row did not reproduce on @duckdb/node-api 1.5.5-r.3 across three forced and one incremental analyze of conducks, forced analyzes of the three test projects, and `oracle:incremental`. The linker step's native memory growth fell from about 270 MB to about 46 MB. The comment beside it says how to revert if the error returns.
- [x] `mcp-truncation-limit.test.ts` read lists as arrays; its client now decodes `{cols, rows}`. No other code the owner runs parses conducks answers.
- [x] End state, 2026-11-11 at load about 6: forced analyze warm 12.6 s and 13.1 s (from 43.4 s), cold 26.0 s; CLI `impact` best of five 0.80 s against 1.04 s for the old main build on the same graph. Related suites for every staged file in one run: 164 suites, 1,300 tests, green.

## Phase 3 — the parser stops importing git
- Depends: todo82#P2
- [ ] Once git signals are computed outside `reflect`, `core/parsing` no longer imports `core/git`. Check: `conducks audit` no longer reports the 9-node cycle through `core/git/index.ts → chronicle-interface.ts`.

## Phase 4 — the watcher stops running git log on a save
- Depends: todo82#P1
- [ ] A save does not change git history, so the watcher reuses the file's stored history and runs `git log` again only after HEAD moves. Blame still runs for the saved file, because its working content changed. Check: saving a file in a watched project starts at most one git process, and the stored values match an analyze of the same tree.

## Phase 5 — balance the workers
- [ ] Each wave splits its files into one fixed chunk per core and spawns a fresh node process per chunk, which reloads tree-sitter and the grammars. UNMEASURED: whether stragglers or start-up cost matter once git is gone; time per-chunk wall clock first.

## Phase 6 — a CLI query does not read the whole graph
- [ ] Each CLI call loads every node and edge before answering (0.57 s of 0.9 s here; about 4× on agent-gateway). Check: `impact`, `trace` and `query` answer the same as before in under 0.3 s.

## Phase 7 — bulk writes
- [ ] Graph inserts are batched multi-row `INSERT`s and cost 3.7 s per warm analyze. DuckDB documents its Appender as much faster. First prove an Appender write commits and rolls back with the pulse transaction (`abortPulse`), and that it avoids the duplicate-key and unaligned-fetch bugs `insertBatched` documents; then time it.

## Phase 8 — install and setup in two commands
- [x] Found 2026-11-11: the README said `npm i -g conducks`, but the package is not on npm (404). The real path was clone, bootstrap, build, link, `setup`, `analyze`, then a hand-edited MCP config for every client except Claude Desktop.
- [x] `npm i -g github:conducks/conducks` does not work: under `-g`, npm runs the git dependency's `prepare` with the global flag inherited, so dev dependencies are not installed locally and the build stops at `tsc: command not found` (reproduced from a local git URL). A packed tarball does work: `npm pack` gives 0.5 MB, and `npm i -g ./conducks-0.7.7.tgz` into an empty prefix took 32 s with `doctor` all green, native grammars included. That is what `npm i -g conducks` will do once the owner publishes (todo16).
- [x] From source is now `git clone … && cd conducks && npm run install:global` (bootstrap, build, `npm link`). The `npm link` step was not run here, because it would repoint this machine's global `conducks`.
- [x] `conducks setup` is the only project step. `mcp-configurator.ts::registerDetected` registers the server in Cursor, Windsurf, Antigravity, Gemini CLI (JSON merge, other servers kept, backup written), Claude Code (through `claude mcp add --scope user`, never by editing `~/.claude.json`, which Claude Code rewrites while it runs) and Codex (one TOML block appended). A client counts as installed when its config directory exists; none is created. Setup then runs the first `analyze` when the project has no vault (`--no-analyze` skips). Tests: 5 new cases in `mcp-configurator.test.ts` (two mutants fail them) and a vault assertion in `system.test.ts`; 39 related suites, 369 tests, green.
- [ ] Not verified: the config paths for Windsurf and Gemini CLI against a real install (none on this machine), Windows and Linux paths for Claude Desktop (still macOS only), and VS Code (not handled).
- [ ] Owner: publish to npm, or attach the tarball to a GitHub release, to make the install one command.

## Phase 9 — the Mirror dashboard drew no graph
- [x] Found 2026-11-11 while capturing screenshots: the page threw `t.quadtree is not a function` and showed only the sidebar. The vendored `d3-force.min.js` is the UMD build that takes `quadtree`, `dispatch` and `timer` from the global `d3` and bundles none of them. `d3-quadtree`, `d3-dispatch` and `d3-timer` 3.0.1 are now vendored and load first (`src/interfaces/web/mirror/public/index.html`, `vendor/README.md`). Checked in headless Chromium: no page error and a painted canvas. `tests/unit/interfaces/web/mirror-vendor-order.test.ts` guards the load order and that each file exists.
- Superseded the same day by Phase 10: the force graph and its vendored libraries were removed.

## Phase 10 — the Mirror becomes a map a person can read
- [x] Owner, 2026-11-11: the dashboard is messy and has no meaning; make it clean, lightweight and helpful, and drop the documentation panels. Sources agree that a force layout of a real codebase is a hairball that encodes no hierarchy, and that a treemap with drill-down is the default worth having.
- [x] The page is now `index.html`, `app.js` and `styles.css` with no library (was 205 kB of vendored d3 and force-graph plus two scripts). The project is drawn as nested boxes: folder or file, sized by lines, coloured by risk, with the next level previewed inside each folder. Hovering outlines what a box uses and what uses it and says so in a sentence; clicking goes in. The side panel is always words about the selection: project (where it starts, what everything leans on, riskiest code, health), folder, file, symbol. Search finds functions and types. The Docs, Forces and Trace panels are gone.
- [x] Data: `GatewayService.overview`, `fileDetail`, `symbolDetail` and `search` answer from SQL; routes `/api/overview`, `/api/file`, `/api/symbol`, `/api/search`. The whole page with its data is 185 kB for conducks (1,184 files). Checked in headless Chromium through overview, hover, drill-down, file, symbol, health and search: no page error.
- [x] Tests: `tests/unit/domain/mirror/overview.test.ts` (4 cases on a seeded vault) and a rewritten `mirror-frontend-is-wired.test.ts` (ids, classes, no external resource, every endpoint is a route; a deleted class fails it). 24 related suites, 186 tests, green. Module note `docs/visuals/modules/interfaces/web.md` rewritten; its rendered `web.html` was not regenerated.
- [ ] Left in place and unused by the page: `/api/synapse`, `/api/node/:id`, `/api/docs`, `getVisualWave` and the `--wave-cap` flag. Remove them with their tests once nothing else calls them (`/api/docs` goes with `code-only`).
- [ ] Not done: showing a file's functions as boxes when a file is selected; a light theme; keyboard navigation of the map.

## Benchmark facts, measured 2026-11-11 (load 3–16, so times are rough)
| project | lines | units | forced analyze | nodes | edges |
|---|---|---|---|---|---|
| conducks | 153,103 | 1,185 | 13.8 s warm, 27.3 s cold | 9,846 | 35,839 |
| scraper | 208,637 | 557 | 9.1 s | 8,936 | 35,099 |
| sofie | 598,214 | 1,508 | 21.6 s | 13,598 | 45,425 |
| orchestrator | 180,310 | 1,107 | 11.6 s | 9,085 | 32,758 |

- CLI queries 0.5–0.9 s. Edge recall 96.7–98.5% and line accuracy 99.9–100% against the compiler and parser oracles; 14 of 14 oracles run pass. Version 0.7.7, 38 CLI commands, 13 MCP tools, 13 grammars. The vs-grep benchmark (2026-08-05) was not re-run, and it names a `conducks arch` command this build does not have.


## Phase 11 — release 0.8.0
- [x] Branch `release-0.8.0`: `code-only` 0cd30d6, plus a8af408, 95b2b3f, c90ef41 and cf4712e from local main, plus this todo's work. Two local commits were left out because they edit the docs domain and the docs skill source, which this branch does not have. Four conflicts, all where the speed work touched docs-side code (`conducks_docs`, the pre-commit hook step, the `hooks` script, the tool tag).
- [x] The installer no longer retires `conducks-docs` or `conducks-visuals`, and uninstall leaves them (`conducks-installer.ts`, `RETIRED_SKILLS`); `installer-scope.test.ts` fails if either name is retired again. On the Mac both skills were renamed (see the handover), so no release can reach them by name.
- [x] `jest --changedSince=origin/main` on the branch: 166 suites passed, 1 skipped; 1,227 tests passed, 4 skipped. The full suite and `npm run gate` were not run.
- [x] Pack test: `npm pack --ignore-scripts` gives 336.5 kB, 662 files, with no local path and no vault inside. Installed into an empty prefix with a fake HOME in 34 s; `doctor` green with 13 native grammars; `setup` in a two-file git project registered Claude Desktop, Cursor and Codex in the fake HOME, built the graph (18 nodes), and `impact` answered. The MCP server lists 12 tools at about 4,190 tokens.
- [ ] Publish, by the owner: `npm login`, then `npm publish --ignore-scripts` from the built branch.
- [ ] Not tested: install on Linux or Windows, Node 20 and 22 (this machine runs Node 25), and a machine with no C/C++ toolchain.

## Phase 12 — the Mirror answers questions
- [x] Owner, 2026-11-11, on the folder map of Phase 10: the boxes had no meaning, and the page did not say whether the code is clean, modular, or safe to change. He asked for answers shown as pictures: diagrams and tables, few words.
- [x] The page is six questions in a left menu, each with a one-line verdict and one picture (`app.js`, about 480 lines, still no library). "Is it clean?" is six checks as tiles with a score ring; "How is it built?" is an SVG diagram of modules in layers, where an arrow that points up or is two-way is drawn red, and clicking a module lights up everything a change to it can affect and lists which of its files the outside uses; then risk, dead code, a reading order, and the modules each entry point passes through. A file or function opens in a drawer.
- [x] On conducks itself (2026-11-11): 2 of 6 checks pass (0 two-way module links, 1 import loop, 0 files with more than 50 dependants, 48 unused symbols, 15 high-risk files no test touches, 7 files over 1,000 lines); 9 modules with 12 one-way links, half of them into `src/lib/core`.
- [x] New routes `/api/dead` and `/api/flows`. API requests are now served one at a time: overlapping requests closed the vault under each other and answered 500. Checked in headless Chromium through every view, the impact click, the drawer and search: no page error. `mirror-frontend-is-wired.test.ts` updated; with `tests/unit/domain/mirror` 16 tests pass.
- [ ] The thresholds (50 dependants, 1,000 lines, risk 0.75, a hub above 40% of links) are fixed in `app.js`; none is configurable and none was tuned on a second project.
- [ ] "Has tests" means a file under a test folder references it; it is not coverage. Not checked on a Python or Go project, where test files are named differently.
- [ ] The website's Mirror screenshot and video show the Phase 10 folder map and must be recaptured.

## Phase 13 — the Mirror as one picture
- [x] Owner, 2026-11-11, on Phase 12: too much text, the question menu read as ugly tabs, and the page looked dated. He asked for a sleek, modern page designed around how a person reads a screen.
- [x] One stage, no menu (`app.js`, `styles.css`): the module diagram fills the screen; a strip of seven readings sits above it (a score ring and six checks) with two guides, "where to start" and "how it runs". Choosing a reading lights up the same diagram where that problem lives, with a count on each module, instead of changing the page. Detail arrives in one card, on request, with six rows at most; a file or function opens in the same card. A single large sentence at the bottom states the verdict.
- [x] The reasoning, so the next change keeps it: a spatial picture is read before text, so the picture is the page; colour is used only for problems, so the eye lands on them first; few choices at any moment; detail on request; movement shows direction (pulses run along each link from the user to the used, and stop under `prefers-reduced-motion`).
- [x] Checked in headless Chromium: the default view, a reading, a selected module, a file in the card, and a hovered path, with no page error. `mirror-frontend-is-wired.test.ts` updated; 16 Mirror tests pass. The tables of Phase 12 are gone; its data and its checks are unchanged.
- [ ] Not judged by the owner yet. Not tried on a project with more than about 12 modules, where one row of the diagram may get crowded, or on a small screen.
- [x] Owner, same day, after seeing it: he liked the picture but could not tell where the program starts, and could not go inside a file to see which files connect to it. Added a glowing START label on the module that holds the entry file (the entry point that reaches the most code); clicking it opens that file. Opening any file now switches the stage to that file in the middle, the files that use it above (tests dashed) and the files it uses below, seven each with a "+N more"; clicking one walks there, and "← all modules" or Esc returns. "Where to start" also lists the other entry points. Checked in the browser: START opens `src/interfaces/cli/index.ts` ("It starts here. Used by 3 files, uses 35."), a click walks to `analyze.ts`, back returns to the modules.
- [ ] The file view shows seven neighbours a side; the rest are only counted. The entry is one file chosen by reach; a project with several real mains shows the others only in the "where to start" card.
- [x] Owner, same day: a module should open as a small codebase of its own, showing what uses what inside it and what crosses its edge. Clicking a module now goes inside it (`app.js`: `childrenOf`, `wire`, `enter`, `goTo`): its sub-folders and files become the diagram, with the outside modules that use it along the top and the ones it uses along the bottom; their lines stay faint until a port is hovered. It repeats at every depth down to a file, a lone sub-folder is stepped through, and a trail (all › interfaces › cli) leads back. Hovering a box previews what a change to it can reach, which replaces the old click-to-select. Readings light up at any depth, and "two-way" is computed for the level on the stage. Checked in the browser: project → `src/interfaces` (3 parts) → `cli` (4) → `commands` (30 files) → a file → Esc → `src/lib/core` (8 parts, 4 outside users), no page error.
- [ ] A level shows at most 40 parts (the largest by lines) and 6 outside modules a side. Links between two files in different sub-folders are drawn between the sub-folders, not flagged as a boundary break; the owner named that as a later step.
- [x] Owner, same day: "it looks amazing"; asked for a cleaner page in the brand colour. Two palettes exist: `docs/brand/creative_brief.md` says void black with electric teal `#00d4ff`, and the live website (which he had just praised) uses black, white and gold `#f2b441` with the duck logo. The Mirror now follows the website: black, white lines, gold as the only accent (pulses, START, the selected box, the active reading), and green, orange and red only as verdicts; orange replaced amber so a warning cannot be mistaken for the brand colour. A 96 px copy of the white duck logo (4 kB) sits beside the project name. To switch to teal, change `--glow` in `styles.css`.
- [ ] The owner has not confirmed which of the two palettes is the brand's; the brief and the website still disagree.

