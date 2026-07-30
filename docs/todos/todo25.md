# todo25 — close the audit: trust boundary, real gates, honest subprocesses
Status: todo
- Acceptance: no input reaches a shell or a file read unfiltered, and no gate in the suite can report clean without having checked the thing it names.

## Context

A five-dimension architecture audit (30 Jul 2026) plus this session's own tracing produced 49
findings. This todo carries the ones that change behaviour; the rest are recorded in `handover.md`
as known and accepted.

Read ADRs 0047, 0048 and 0049 first — they hold the decisions, and the phases below only implement
them. The audit's own verdict on the architecture was good and should not be lost in a list of
problems: one composition root, dependency direction genuinely held, and **zero static import
violations across 198 files**, verified independently. What follows is edge work, not a rebuild.

**Two findings are exploitable today and everything else can wait behind them.** Phase 1 is not
sequenced first for tidiness.

Phase order matters only where stated. Phases 1, 3, 4 and 5 touch disjoint files and can run at the
same time; Phase 2 must follow Phase 1 because both rewrite `chronicle-interface.ts`, and Phase 6
must follow Phase 4 because it triages what that gate reports.

## Phase 1 — the trust boundary
- Builds: 0047
- [x] DONE and proven exploitable first: a scratch repo with a file named `a";touch pwned;echo "b.ts` had the canary CREATED by the old `execSync` path and not by the new one. All nine sites now go through one `git(args[])` helper using `execFileSync`; the `| sort -u | wc -l` pipe is counted in JS, which removed the last reason any of them needed a shell. Git commands are built from an argument array, not a string. Nine `this.exec(...)` sites in `chronicle-interface.ts` interpolate a repo-controlled path into a shell string run by `execSync` (`/bin/sh -c`) — `:250`, `:306`, `:345`, `:378` are the ones taking a filename. Fixed when a file named to close a quote and open a subshell is analysed with no command executed, asserted by a test that creates such a file in a temp repo and checks for its side effect. The injected `exec` seam changes signature, so the chronicle tests move with it
- [x] DONE. The prefix check stays and is paired with a named-function denylist covering file reads, globs, network CSV/JSON and ATTACH. Five tests, including that `SELECT glob FROM nodes` is still allowed because the guard requires a call. `conducks_graph_query` rejects table functions rather than checking a prefix. VERIFIED exploitable: `SELECT * FROM read_text('/etc/hosts')` passes `startsWith('SELECT')` and returns the file. Fixed when that statement is refused with a message naming the rejected function, a plain SELECT against `nodes`/`edges` still works, and a test covers both
- [x] DONE. `start(port, host='127.0.0.1')` and a `--host <addr>` opt-in that warns the routes are unauthenticated. Breaking default — changelog. `mirror` binds `127.0.0.1` by default. `app.listen(port)` with no host binds every interface and serves `/api/synapse`, `/api/governance` and `/api/docs` unauthenticated; CORS restricts browsers, not `curl`. Fixed when the default is loopback and exposing it is an explicit flag that warns. Note in the changelog as a breaking default
- [ ] `.env` content does not leave the vault. UNMEASURED and decide before building: nothing found in the audit reads that content, so removing the file type from discovery may be simpler than filtering it. Answer by grepping every consumer of a unit's source; if none reads it, drop the type and close ADR 0047's open question

## Phase 2 — a hung subprocess is not a slow one
- Depends: todo25#P1
- Builds: 0049
- [x] DONE in the same pass as Phase 1, as planned — the `git()` helper carries `timeout: 30_000` and a 64 MB `maxBuffer`, so all nine sites got it at once. 30s is a guess and says so; the first real timeout report is the measurement that corrects it. Every `execSync` in the chronicle carries a timeout — nine call sites, none has one, so a corrupted or network-mounted `.git` hangs the caller forever. Sequenced after Phase 1 because both rewrite the same call sites; doing them together avoids touching each twice

## Phase 3 — the worker pool reports what happened
- Builds: 0049
- [x] DONE. `status`, `signal` and `error` are inspected; a crash, a timeout and an unreadable output file each throw with the chunk size and the first three paths named. `spawnSync`'s return value was discarded (`worker-pool.ts:79-87`), a missing output file resolves to `[]` (`:89-100`), and the worker's crash path never writes the file (`pulse-worker.ts:143-156`) — so a segfault is indistinguishable from a chunk with no symbols, and a chunk is `files.length / coreCount`. Fixed when a worker killed mid-run fails the pulse with the chunk named, asserted by a test that kills one
- [x] DONE — 10 minutes, distinguished from a kill in the message. A guess, and it says so. `spawnSync` carries a timeout, reported as its own outcome rather than as a crash or a slow success. The value is a guess until something real times out — make it generous, configurable, and loud when it fires
- [x] DONE, with three tests confirmed red against its removal — including one asserting the missing PATHS are named rather than a count. The orchestrator compares results received against files sent per chunk (`orchestrator.ts:126-149` does not) and fails the pulse on a shortfall, naming the missing paths. Deliberately in the orchestrator rather than the pool: the pool's own accounting is what is being checked
- [ ] UNMEASURED, and answer it here: `pulse-worker.ts:99` drops a file whose extension has no provider with no result and no log. Count how many files that is on a polyglot repository before deciding whether it needs reporting — it may be nothing, and it may be the same conflation one layer earlier

## Phase 4 — the static boundary gate
- Builds: 0048
- [x] DONE — `tests/architecture/boundaries.test.ts`. Went red on all four dynamic violations the moment it was written, which is the only reason to trust it. A suite test walks `src/`, resolves every import against `ALLOWED_DEPENDENCIES`, and fails on a forbidden RUNTIME edge — reading both `import ... from` and `import(...)`, excluding `import type` with the reason stated. It needs no graph, no vault and no engine, so it cannot be defeated by anything the parser failed to capture. GROUND TRUTH already measured: 0 static violations across 198 files, and 4 dynamic ones
- [x] DONE. Composition grew a `createGraph()` factory, the diff engine was already exposed at `registry.query.diff`, and the `instanceof SynapsePersistence` check became a capability check — the question was whether the vault can answer a query, not which class implements it. The three `cli -> core` dynamic imports in `diff.ts` were a real violation — route them through composition
- [x] DECIDED: exception granted, narrowly and in writing. It is a process entry point that happens to live under core, spawned standalone, so the reflector cannot be injected across the process boundary. The gate records file + specifier + reason, and a test asserts the exception stays one file and one specifier — any other core→domain edge still fails. Moving the reflector into core or inverting it behind a contracts port remain the ways to remove it. The `core -> domain` dynamic import at `pulse-worker.ts:35` is load-bearing (it keeps tree-sitter off the CLI boot path) and needs a decision, not a deletion: either the reflector's interface moves to `contracts` so core may depend on it legally, or the contract grows a documented exception. Granting it silently by leaving it invisible is what ADR 0048 exists to stop
- [x] DONE, in the file header: a computed `import(someVar)` is not resolvable by reading text, and `require()` is not checked because this codebase is ESM. The gate states which forms it cannot see — a computed `import(someVar)` is not resolvable by a file scanner, and claiming otherwise is the failure this whole todo is about

## Phase 5 — tests that can fail
- Builds: 0048
- [x] DONE — replaced with the tool surface itself: all 14 tools register, and every one has a description and an object input schema. The count is asserted so losing a tool fails here. `mcp-server.test.ts:42-46` asserted `expect(server).toBeDefined()` after construction — it cannot fail. `:48-52` does the same under a name promising resource-definition coverage. Replace both with assertions about the tool list and resource list, or delete them; a test that cannot fail is worse than none because it reads as coverage
- [x] DONE — it now compares the newest source mtime against the built CLI and rebuilds when stale. One directory walk per suite, and it removes the class of false green that bit this session twice. `helpers.ensureBuild()` only built when `build/` was missing, never when it is stale — an integration test will happily prove a fix that was never compiled. This was hit twice in one session. Fixed when a source file newer than the build triggers a rebuild
- [x] PARTLY: kinetic covered first, as planned, because it owns `impact` and `trace`. Five cases, and two of them pin behaviour nobody had written down — the third argument to `getImpact` is a cumulative EDGE-WEIGHT ceiling despite being named `depth` everywhere, and a truncated traversal sets no flag. `visual` and `interfaces/web` remain uncovered; `interfaces/web` has none of either. Kinetic first: it owns `impact` and `trace`, the two answers users act on
- [x] DONE — removed. It pointed at `tests/persistence/**`, a directory that does not exist, so it contributed nothing while appearing in the config as a whole suite. The unit project's ignore for that path is noted in place, since recreating the directory would otherwise silently run nothing. Point it at real tests or remove it
- [x] DONE — opened read-only, and verified passing with a live `conducks mcp` server attached. The old comment claimed read-write was needed for "DB creation on fresh runners"; a fresh runner has no graph to audit, so skipping is the honest behaviour there. `tests/database/ts/structural.test.ts:17` opened THIS repository's real vault read-write (`new SynapsePersistence(process.cwd())`), so all four of its cases fail with a DuckDB lock error whenever a `conducks mcp` server is connected — which is whenever the tool is actually being used. Found by running the suite while the audit's own agents held an MCP session. Fixed when the suite passes with a live MCP server attached: open read-only, or build a fixture vault, but do not make a green suite depend on nobody using the tool

## Phase 6 — triage the 458
- Depends: todo25#P4
- Builds: 0048
- [ ] `conducks guard` reports `rank_violations=458` as "pre-existing, tracked" and passes. A number carried as acceptable long enough stops being read. Sample 20, classify each as a real inversion or a rule artefact, and either fix the rule or set a ratchet the count may not exceed. Answers ADR 0048's open question

## Phase 7 — the two design questions carried from todo24
- [ ] What a pulse may leave behind. `pulseId` means FIRST seen, not last: two pulses into a clean vault there are 3,624 re-stamped nodes and 1,653 induced ones still carrying the pulse that created them, so deleting rows that are not the newest deletes every valid external symbol. Needs an ADR that says what identifies a live row before any sweep is written. Carried from todo24#P5
- [ ] What an edge endpoint must be. A `PULSES_TO` edge's source is the variable name, not a node id, so 199 edges point from something the graph does not contain — and `audit` does not see it because its orphan check reads targets only. Options are the producing call's target, the enclosing scope, or a materialised local. Carried from todo24#P4
- [ ] Whether the 14 domain classes that do not implement `ConducksComponent` should conform, or the rule should ask for less. This is a judgement about the architecture and belongs to the author, not to whoever picks up the todo. Carried from todo24#P6

## Phase 8 — capability gaps, recorded not scheduled
- [ ] TS, TSX and Go record ZERO inheritance edges, and they are the flagship languages. C++, C# and PHP capture no heritage at all; Python, Rust and Ruby use the standalone shape their own query files call silently dropped. Fixed when a fixture class with a parent produces an EXTENDS edge in each language claimed to support it
- [ ] Type-only import detection works for TS/TSX/Go only; the other ten languages are type-blind
- [ ] The computed impact risk band reaches no surface — no CLI, MCP or watcher output shows it. Either surface it or delete the code path; it currently reads as a live feature
- [ ] 13 taxonomy kinds are declared, 9 persisted. Reconcile the declaration with reality or say in the type why four are unreachable
- [ ] `coverage-view.ts:68-72` still carries the over-binding basename fallback that `coverage-bind.ts` replaced, so one covered `index.ts` can light up every same-named file
