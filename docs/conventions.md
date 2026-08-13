# Conventions — conducks

## CONDUCKS-1 — No circular imports in Synapse Core
- Rule: No circular imports in Synapse Core (`src/lib/core/` and `src/registry/`).
- Reason: Ensures atomic mirroring and prevents resonance leaks. Synapse must have zero external project dependencies.

## CONDUCKS-2 — Prism lens interface
- Rule: Every Prism language lens must expose a `reflect()` method and an `extensions: string[]` array.
- Reason: Facilitates discovery of structural lenses via the dynamic registry. Without a consistent interface, the registry cannot load lenses uniformly.

## CONDUCKS-3 — Git-direct file discovery
- Rule: `ChronicleInterface` must only use git-direct commands for file discovery (e.g., `git cat-file --batch`). Non-git projects use the recursive FS fallback only.
- Reason: Maintains high-fidelity synchronization with repository history. Mixing strategies produces unreliable discovery results.

## CONDUCKS-4 — Canonical lowercase node IDs
- Rule: All node IDs must be lowercase, absolute-normalized canonical FQNs: `lowercased/absolute/path.ts::classname.method`.
- Reason: macOS APFS is case-insensitive. Mixed-case IDs cause structural graph fragmentation where `/Users/Said/` and `/users/said/` become distinct nodes, breaking cross-module links.

## CONDUCKS-5 — Persistence via driver interface only
- Rule: All persistence must implement the `SynapsePersistence` driver interface. Direct DuckDB calls are forbidden outside the persistence layer.
- Reason: Allows storage swaps without breaking the Mirror Pulse. Enforces the Connect-Execute-Disconnect lifecycle to prevent lock contention.

## CONDUCKS-6 — Weighted Dijkstra for impact analysis
- Rule: All impact analysis must use Weighted Dijkstra. BFS/DFS-based traversal is forbidden for blast radius calculations.
- Reason: Edge type weights (call=1.0, import=0.7, inheritance=1.2, db_write=1.5) encode structural risk. Unweighted traversal produces incorrect blast radius estimates.

## CONDUCKS-7 — Vectorized SQL for framework coverage
- Rule: Framework coverage must be aggregated via DuckDB vectorized SQL, not application-level loops.
- Reason: Enables sub-second ecosystem-wide aggregation. Application-level loops degrade to O(n) on 100k+ node codebases.

## CONDUCKS-8 — MCP server is read-only
- Rule: The MCP server is strictly read-only. No write operations (`conducks analyze`, `conducks rename`, `conducks clean`) are exposed via MCP tools.
- Reason: Write operations cause DuckDB lock contention when the MCP server holds a read connection. Isolating writes to the CLI eliminates locking conflicts. Enforced as Rule 6/13.

## CONDUCKS-9 — One source of truth for the MCP tool surface
- Rule: Tools are registered in exactly one place — `synapseTools` (`src/interfaces/tools/tools/synapse.ts`) and `kineticTools` (`src/interfaces/tools/tools/kinetic.ts`), assembled in `server.ts`. The tool count is derived from that list at runtime and is never restated as a literal in code, a comment, a convention, or an ADR. Adding or removing a tool means editing only the exporting file.
- Reason: The count was asserted four different ways at once (ADR 0006 said 12, this rule said 9, `server.ts` said 13, the real surface was 14), so the startup mismatch warning fired on every boot and every restated number was a doc that could rot. A derived count cannot drift from the code. Skills are held to the same surface by the skills↔tools test (ADR 0018 §4).

## CONDUCKS-10 — System-injected pulseId
- Rule: `pulseId` is always system-injected in MCP tool execution. It is never accepted as a parameter from agents.
- Reason: Prevents agents from accidentally or maliciously querying stale structural snapshots. The system always resolves to the latest pulse.

## CONDUCKS-11 — Explicit per-worker grammar loading
- Rule: Worker threads must explicitly load their required WASM grammars (`typescript.wasm`, `python.wasm`, `go.wasm`) before commencing pulses. Grammar loading is not inherited from the parent thread.
- Reason: The Grammar Bridge (v0.9.0) fix. Without explicit per-worker grammar loading, workers produce "Missing Grammar" nodes and the structural graph collapses. Grammar is cached per worker, not per file.

## CONDUCKS-12 — Connect-Execute-Disconnect for DuckDB
- Rule: All DuckDB connections use the Connect-Execute-Disconnect pattern. Connections must be released immediately after query execution.
- Reason: Lazy persistence prevents database locking during parallel CLI + MCP server usage. Persistent connections block concurrent writes. Never open two read-write connections at once: `conducks analyze` holds read-write, the MCP server read-only. `conducks clean` clears zombie handles when lock files accumulate.

## CONDUCKS-13 — Every finding declares the edge types it counts
- Rule: A governance finding names its edge set from the shared constants in `core/graph/adjacency-list.ts` and nowhere else. ARCH-3 (circular dependency) traverses module imports only — `IMPORT_CYCLE_IGNORED_EDGE_TYPES` (containment + `TYPE_REFERENCE` + `CALLS`/`CONSTRUCTS`/`ACCESSES`) plus `ignoreTypeOnly: true` — and a cycle must span ≥2 files. ARCH-1 (hub overload) excludes `NON_RUNTIME_EDGE_TYPES` and type-only imports. `prune`/dead-code counts the opposite on purpose: `IMPORTS`, `TYPE_REFERENCE` and type-only imports all register as usage, because "is it referenced" is not "does it couple at runtime". A new rule states its set in its ADR before it ships.
- Reason: three separate false-positive hunts had one cause — the finding counted a relationship it did not mean. Four `detectCycles` call sites once held four definitions of "cycle"; they are aligned on one constant now and must stay so. — ADR 0010, 0016, 0017

## CONDUCKS-14 — Conducks ships structural guidance only
- Rule: Nothing conducks distributes — skills, CLI help, MCP tool text — carries generic engineering standards: no frontend/backend/security/styling/presentation opinions, no CSS token rules, no API response-envelope conventions. A skill is a conducks entry point or it does not ship.
- Reason: it is a structural code-intelligence tool; opinions outside that scope have no source of truth here and rot unnoticed. The rule was stated once in an ADR and then violated for months inside `conducks-guide.md` — about two thirds of a 119-line file, and the first thing a new agent read. — ADR 0006, 0018

## CONDUCKS-15 — Skills name only live tools, and only one copy is editable
- Rule: A skill in `src/resources/skills/` may name a `conducks_*` tool only if that tool exists in the registered MCP surface; the skills↔tools test fails the suite otherwise. `src/resources/skills/` is the only editable copy — `build/src/resources/skills/`, `~/.claude/skills/<name>/SKILL.md` (global) and `<project>/.claude/skills/<name>/SKILL.md` (local) are generated and must never be hand-edited. `conducks setup` installs GLOBAL by default (`--local` pins a repo copy, both flags do both) and refreshes any scope that already holds an older copy, whether or not it was asked for; sync never deletes, only `uninstall` removes.
- Reason: a wrong tool name in prose fails only when an agent tries the call, and then it reads as an agent error rather than a stale doc; five of eight skills once named six dead tools. The installer resolves `SKILLS_DIR` relative to its own compiled file, so `conducks setup` ships the build copy — editing a generated copy reinstalls stale guidance over current guidance. — ADR 0018

## CONDUCKS-16 — The kind taxonomy only grows
- Rule: `CanonicalKind` values are added, never renamed or removed. Numeric ranks may be resequenced (rank is relative ordering only); a new kind gets a deliberate rank, not the next free number. Removing or consolidating a kind is a separate migration with its own ADR.
- Reason: roughly two dozen call sites compare kind values as raw strings (`import-resolver`, `http-service-linker`, `mirror.engine`, `dead-code`, `query-service`), so a rename breaks them silently while the build stays green. Rank drives hierarchy, layer paths and several governance rules. — ADR 0003

## CONDUCKS-17 — Edge data lives on `.properties` and `.confidence`
- Rule: A `ConducksEdge` carries data on `.properties` and `.confidence`; `.metadata`/`.weight` do not exist on edges. Any change to edge persistence must assert the full save→load round-trip, not just the save side.
- Reason: reading `.metadata` at save wrote `properties={}` on every edge, and the mirror-image bug on load left all 4971 loaded edges with `properties === undefined`. A save-only test catches neither. `tests/unit/core/edge-roundtrip.test.ts` exists for exactly this.

## CONDUCKS-18 — A doc value is one whole line, and never wraps
- Rule: In the docs grammar a value is the entire line after its marker (`Status:`, `- Key:`, `- [ ]`) — never split on whitespace by a reader, never continued onto a second line by an author. A value needing a paragraph goes in a `##` section; prose wraps freely. `docs-lint` fails a wrapped value and a `Status:` outside its type's vocabulary (`todo doing done blocked` / `Accepted`, `Superseded by NNNN` / `current stale`).
- Reason: the grammar has five per-line primitives and no continuation rule, so a wrapped line matches nothing and is dropped in silence — 0003's status lost half its content while the board still read clean. On the reader's side `s.split(/\s/)[0]` turned `Amended by 0012` into `Amended`, losing the ref and printing a changed record as active. — ADR 0019

## CONDUCKS-19 — An ADR carries its own state; no index restates it
- Rule: `Status:` holds life state only (`Accepted` | `Superseded by NNNN`) and is the one line of an accepted ADR that may change; the body stays frozen. Cross-ADR links are fields stamped on BOTH ends — `Amended by`/`Amends`, `Superseded by`/`Supersedes`, `Resolved by`/`Resolves` — and an amended ADR stays `Accepted` and binding. `decisions/README.md` holds no list and no per-record state; the set comes from `conducks docs-status`. Generally: a README may say what a folder is FOR, never what state its records are in.
- Reason: an index of records is derived structure, so hand-keeping one is the duplication ADR 0011 banned, and it drifts unlinted — the index was the only place amendments were visible while three ADRs already recorded them as fields. Enforcing the both-ends stamp found four relations only one side had recorded. — ADR 0019, 0011

## CONDUCKS-20 — The phase is the unit of linkage
- Rule: A todo phase declares `- Builds: NNNN` for the ADR it implements and `- Depends: todoNN#PN` for the phase it waits on; both are one-way, the reverse is derived. Phase numbers are unique within a file because `todoNN#PN` is an address. A phase serves one decision or none — if it serves two, it is two phases. ADRs stay prose: no checkboxes, no numbered requirement list; the granularity lives in the todo. A supersede whose target has unbuilt phases fails lint unless the successor states `- Inherits: NNNN`.
- Reason: the docs held one cross-file link (ADR↔ADR) and finding what an accepted decision left unbuilt meant reading every record bottom-up. Superseding a half-built ADR is the dangerous case — the reasoning dies, the shipped half does not, and an agent told to ignore the record will 'fix' code that correctly implements it. — ADR 0020

## CONDUCKS-21 — Read-once and read-often are separate payloads
- Rule: `conducks_docs` returns open threads only, rooted at the ADRs that own them — finished work is omitted. Constraints (conventions, memory, handover) ship on the session-start call and are dropped with `layer: "board"` afterwards. `features.md` is never pushed; it is written once an ADR and its todos are finished. Every emitted line is an address (`todo09#P2`, a file path) or a state — never copied doc prose.
- Reason: the full board was 14.7k tokens per call, 10.7k of it material read once per session; the projection returns 3.7k then 1.4k. Copying prose would make the tool a second version of the docs, which is the one failure mode that would make it worse than nothing. — ADR 0020

## CONDUCKS-22 — The layer contract is enforced, not advised
- Rule: Imports run downward only — `contracts` ← `core` ← `domain` ← `composition` ← the interfaces (`cli`, `mcp`, `web`). Same-layer edges are legal; upward edges are not. The two sibling exceptions are launchers, not logic: `cli → web` (the `mirror` command) and `cli → mcp` (the `mcp` command). An interface reaching into `core` or `domain` routes through `registry/index.ts` instead. The `layer_boundaries` sentinel rule enforces it and must stay enabled.
- Reason: the rule existed as ADR 0005 and a disabled sentinel rule for months while ~71 illegal edges accumulated (cli→core 32, cli→domain 29, mcp→core 5, mcp→domain 3, cli→mcp 2) — the contract was true on paper and false in the graph. It is also what keeps the domain from importing web, which is how the old domain→web→composition→domain cycle formed. — ADR 0005, 0002

## CONDUCKS-23 — A pulse target must look like a project
- Rule: `conducks analyze` grades its root before writing anything (`core/utils/scope-guard.ts`), and NOTHING is forbidden — a hard block gets worked around. `ask-twice` (confirm, then type the folder name): OS trees, the home dir and anything directly under it, cloud-sync folders, repo-parking folders, dependency/build dirs by name (`node_modules`, `vendor`, `dist`, `target`, `.venv`, …), and any folder whose subfolders are themselves projects. `ask` (one question): no project marker, or over 25,000 files. `ok`: runs silently. With no TTY anything above `ok` is a refusal; `--yes` is the only bypass. The assessment is pure and returns reasons, so CLI, MCP and tests share one rule.
- Reason: the command took any path at all, so one typo (`conducks analyze ~/Documents`) started an hours-long pulse over every repo and photo library under it and wrote a `.conducks` vault into a folder that is not a project. Silence must not start an unbounded write: a question nobody can answer is a NO. The folder-of-projects rule exists because no hardcoded list can know where someone parks their repos — it caught `~/Documents/Gospel_Of_Technology`. — ADR 0021

## CONDUCKS-24 — A docs-layer tool never touches the graph
- Rule: every MCP tool declares `layer: "docs" | "code"` (`src/contracts/types.ts`), and the tool list prefixes its description with the layer. A `docs` tool reads authored markdown only: it must not call `ensureAnchor`, must not initialize the registry, must not open DuckDB, and must answer on a folder that was never analyzed — it resolves its root with `resolveDocsRoot()` instead. A `code` tool answers from the graph and may assume a pulse has run. Adding a tool means picking a layer; the test fails if it is unset.
- Reason: `conducks_docs` booted the whole grammar engine, graph and a database connection to read four markdown files, so "what is on the table" was unanswerable on an unanalyzed project and every docs call held a lock other callers queue behind. Names were left alone deliberately — MCP has no namespaces, and renaming to `conducks_docs_*` would break every skill and saved client config to say what a description prefix already says. — ADR 0023

## CONDUCKS-25 — There is no progress file
- Rule: never write `progress.md`. What shipped and when is derived from dated ADRs and closed todos and returned as `recent` by `conducks docs-status` / `conducks_docs` (`recent: <n>`, default 4). An existing `progress.md` classifies as `derived` — not governed, not linted, not parsed — and is archived to `legacy/`, never deleted.
- Reason: it restated two records that already carry the same fact, which is the write-a-fact-twice failure the standard exists to prevent. Calling it "optional" (ADR 0020) settled nothing — an optional governed file is one everybody still writes and still has to keep in sync. — ADR 0024

## CONDUCKS-26 — A shipped skill is written for someone else's project
- Rule: a skill in `src/resources/skills/` states instructions ("confirm with grep before deleting"), not prohibitions; grounds a rule by naming its cost in the same sentence rather than citing a record number; and uses no path from this repository as though it were universal. Four skills ship: `conducks-guide`, `conducks-workflows`, `conducks-docs`, `conducks-cli` — a new one needs a subject none of them covers. Retiring a skill adds its name to `RETIRED_SKILLS` in the installer so it is deleted from every scope on the next sync.
- Reason: the skills load in every repository conducks touches, and an internal record number is unopenable there — a citation the reader cannot follow reads as authority without evidence. Five skills said the same thing five ways, so an agent paid for the framing five times to reach five short probe lists. — ADR 0025

## CONDUCKS-27 — A dependency that may be absent is never reached by a static import
- Rule: anything in `optionalDependencies` — today `tree-sitter` and the 12 `tree-sitter-*` grammars — is reached only by `import type` (erased at compile) or by a lazy `require` inside a function, wrapped in `try/catch`, behind a cached loader. One loader per optional package: `GrammarRegistry.loadNative()` is the only place that touches the binding, and `isNativeAvailable()` is how callers ask. Absence must never crash module LOAD; what it costs at RUN time is a separate question, and for `tree-sitter` the answer since ADR 0089 is that there is no fallback — `analyze` refuses once, up front, with a named error, and `doctor` reports `Parse path: NONE`. This rule requires the graceful load, not a graceful degrade. `tests/unit/core/parsing/optional-native-binding.test.ts` fails the build on any value import of a `tree-sitter*` package.
- Reason: ESM resolves every static import before the first line of a module executes, so a `try/catch` inside the module cannot protect it — an absent optional dep kills the process at load with `ERR_MODULE_NOT_FOUND`, before the handling that exists for it can run. The difference matters: dying at load takes the WHOLE CLI, including the docs commands and the `doctor` that would have explained it. And on the machines where this fires, the test suite that would have caught it cannot run either. It held by accident for a long time: `Parser` happened to appear only in type positions in 12 files, so `tsc` erased those imports; one `new Parser()` would have turned a graceful degrade into a dead CLI. — ADR 0027

## CONDUCKS-28 — A hand-built graph fixture uses the producer's node-id shape
- Rule (extended, todo62): this binds EMITTED EDGES too, not only fixtures. Whatever names an edge endpoint must produce the id the node writer stores — including its enclosing scope, where the node carries one. An edge naming an id nothing stores does not error and does not appear as a broken link: `pruneTaxonomy`'s ATOM gate counts a node referenced only when an edge's endpoint IS that node, so the node is deleted as unused, and prune's own edge cleanup does not match the edge either. What is left is a confident edge whose node no longer exists. MEASURED: `processAlias` built `<file>::doit` for a binding stored as `<file>::main2.doit`, and 3 such edges sat in this repository behind an audit that could not see them.
- Rule: any test constructing a `ConducksAdjacencyList` by hand builds ids the way the pulse builds them — `repository::<name>`, `directory::<abs-path>`, `<file>::unit`, `<file>::<symbol>` — never a bare file path as an id. A file path reaches the graph through `getNeighborsByFilePath()` (`adjacency-list.ts:346`) or by filtering `properties.filePath`, never by being passed to `getNeighbors()`. When a test needs both, assert the translation, not the coincidence.
- Reason: `NodeId` is a type alias for `string`, so the compiler accepts a file path everywhere an id belongs and the mistake survives to runtime as an empty result rather than an error. `daac.test.ts` was green for months over a module that returns one cluster per file on every real graph, because its fixture set `id` equal to `filePath` — the single arrangement in which the broken lookup resolves. A fixture written from the same misunderstanding as the code agrees with the code, and agreement reads as a pass. — ADR 0028

## CONDUCKS-29 — An always-on process reports; it never fixes
- Rule: `conducks monitor` and the docs watcher report and exit 0. They do not analyze, do not write to a vault, do not edit a doc and do not fail a build. The one write the monitor performs is `--dismiss`, which is explicit, per-module, and records the hash of the code it was checked against. A dismissal that means "an enhancement landed" must name an address — an ADR number, a todo, or a path — and that address is verified to exist before it is stored. Anything that would make an unattended process start a pulse, rewrite a file or break a commit belongs in a command a human typed.
- Reason: a monitor that edits files or blocks work gets switched off inside a week, and a switched-off monitor reports nothing at all — so the useful version is strictly the one people leave running. The dismissal is bound to a content hash rather than to a date for the same reason in miniature: "checked, still accurate" has to expire when the code moves, or it is a mute button rather than an escape hatch. And an intent address that points at nothing is worse than no address, because a reader follows it and finds a doc nobody wrote. — ADR 0031

## CONDUCKS-30 — Anything that walks the graph asks for it first
- Rule: the structural graph is not materialised by `registry.initialize()`. Any path that WALKS it — traversal, a whole-graph scan, name resolution against in-memory nodes — calls `await registry.infrastructure.ensureGraphLoaded()` before touching it, and in the MCP surface that is `ensureAnchor(path, readOnly, needsGraph)` with `needsGraph` left at its default of TRUE. A tool passes `false` only once it is PROVEN to answer from SQL or from files. Anything that can answer from the vault should: counts are `count(*)`, and graph-level facts are rows in `metadata`.
- Reason: a deferred graph reads as an EMPTY graph rather than as an error, so forgetting produces a confident wrong answer instead of a failure. Measured when the deferral first landed: four of six MCP tools broke and THREE broke silently — `nodeCount: 0`, zero flows, SYMBOL_NOT_FOUND, nothing logged. The `graphEngine` accessor throws while a load is pending, but that is not a complete defence and must not be treated as one: `governance`, `search`, `kinetic` and `metrics` capture `graph.getGraph()` at construction and never pass the accessor, which is exactly why the default is safe rather than fast. — ADR 0038

## CONDUCKS-31 — A claim about where a cost is carries its number, or says it has none
- Rule: a task that asserts WHERE the cost, the win or the bottleneck is must carry the measurement, or open with `UNMEASURED:` and say what to time first. Never write "this is the real win", "the other half is nearly free" or "X is the bottleneck" as bare prose. If checking is cheaper than the work being planned, check first. A claim that genuinely cannot be checked yet is a Phase 0 question, not a premise inside a build phase.
- Reason: this is not the same mistake as writing a hunch, and it does not feel like one. A design session produces real understanding, and a sentence like "this is the real win and the real difficulty; the parse half is nearly free" reads as knowledge rather than as a guess — so it goes in unmarked and the next person optimises the half it named. Both halves of that exact sentence were wrong in `todo21#P1`: the "real win" measured 31-75 ms of an 807 ms edit, and the "nearly free" parse half measured 423 ms and was the single biggest phase. Two optimisations were sized backwards before anyone timed anything. — §6.8

## CONDUCKS-32 — A degraded answer is labelled, never disguised
- Rule: when a code path cannot get the real answer, it must either REFUSE (throw, return null, drop the row) or return a value the caller can tell apart from a real one. It must never return a value that is indistinguishable from success. In particular: a numeric zero may not stand for "could not measure", an empty collection may not stand for "could not read", and a guessed graph edge may not carry the same confidence as a resolved one.
- Reason: fourteen fallbacks in this codebase guessed, and every one of them was invisible once written. `getCommitsBehind` returned `0` for a broken git — the same value as "you are current", and the value that silences the staleness banner. `getAuthorDistribution` returned `{}` for an unreadable file, which scores identical entropy to a perfectly-owned one. `CallProcessor` stamped 0.85 on a resolved target and on a bare name it had given up on, which is why `WHERE confidence < 0.6` returned zero rows on a graph where half the edges dangled. A guess is often the right behaviour; recording it as a fact never is. — ADR 0046

## CONDUCKS-33 — A verdict is earned by a comparison that happened
- Rule: a check that could not run reports that it could not run. `.some()`, `.every()` and `.filter().length` over rows from a query are not verdicts until the row count is known — `.every()` is the sharpest edge, since it returns TRUE on an empty collection.
- Reason: `drift` reported `STABLE` from a thrown SQL query and from two pulses with nothing in common, because `deltas.some(...)` is false on an empty array. `guard` turned that into "✅ Stability acceptable: Global risk (0.000)" — a pre-commit gate passing a comparison that never happened, on this repository, for weeks. The count that would have exposed it was already printed on the next line. — ADR 0044

## CONDUCKS-34 — A test for a writer asserts what the store holds
- Rule: a feature that writes is tested by reading the data back, not by reading a CLI surface or a log line. An enforcing test must be confirmed RED against the unfixed code before it is accepted.
- Reason: the first version of `virtual-induction.test.ts` asserted on `conducks audit` and `conducks query` output and passed against a build with the persist call removed — no surface was sensitive to whether the rows existed, which is exactly the blindness that let the bug survive. Three features logged success while persisting nothing, through 660 passing tests. And `helpers.ensureBuild()` only builds when `build/` is missing, so an integration test will happily run against a stale build and appear to prove a fix that was never compiled. — todo24#P3

## CONDUCKS-35 — A subprocess is invoked with an argument array, never a command string
- Rule: `execFileSync`/`spawnSync` with the command and its arguments passed separately. Never build a string that reaches a shell, regardless of where its values came from. Every subprocess call also carries a timeout, and its `status`/`signal`/`error` are inspected before its output is used.
- Reason: `ChronicleInterface` interpolated a repo-relative path — supplied by `git ls-files`, so attacker-controlled in any cloned repository — into a double-quoted string run through `execSync`, which is `/bin/sh -c`. A filename containing a quote and `$()` executes commands. Shell-escaping would also have worked and would have had to be remembered at every future call site; removing the shell leaves nothing to remember. The timeout and status half is the same rule from the other end: `WorkerPool` discarded `spawnSync`'s return value, so a segfault and a chunk with no symbols were the same result. — ADR 0047, ADR 0049

## CONDUCKS-36 — A failing test is never labelled "pre-existing" without a linked todo
- Rule: A test that is failing, skipped or disabled carries a `todoNN#PN` reference saying who owns it. "Pre-existing" alone is not a label, it is a decision to tolerate — and it must be an explicit one.
- Reason: Four shipped commands were broken while CI reported it correctly the entire time (todo22#P11). CI was not the gap; nobody disputed the red, they absorbed it. Nothing mechanical can force a human to read a build log, so this is a convention rather than a gate, and that is stated plainly rather than dressed up as a check. What IS mechanical: the repo currently has exactly ONE skipped test (`tests/database/ts/structural.test.ts:24`), a conditional skip that documents itself by construction — so any second one is visible in a grep, and this rule is what that grep is checked against.

## CONDUCKS-37 — Every "clean" states what it examined
- Rule: A message reporting success over a set — "clean", "none found", "no violations", "no patterns detected" — names the size of the set it checked. A count of zero is reported as *nothing was checked*, never as a pass, and the command exits non-zero when it could not measure.
- Reason: This failed FIVE times in one codebase. `audit`'s sentinel line printed a green tick for zero rules (ADR 0044, ADR 0073); `fallback` printed "No suspicious fallback patterns found" for a field no producer writes, on every project and every filter (ADR 0123); `docs-lint` reported "clean — 0 governed docs" for a repository with no docs at all, and `docs-status` agreed, which matters most because those two ARE the enforcement (ADR 0124). The reader cannot tell a clean result from an empty one, and the empty one is the dangerous half: it is indistinguishable from a working check.

## CONDUCKS-38 — A field is read under the name its producer writes
- Rule: Before a query, a filter or a reconstitution reads a field, check what writes it. A `SELECT` naming a column the table does not have, or a filter on a property nothing sets, returns empty rather than failing — and empty is then reported as an answer.
- Reason: Three instances in one sweep, all silent. `diff` reconstituted historical nodes from `row.label` and `row.filePath`, columns the `nodes` table does not have (it stores `canonicalKind` and `file`), and separately queried `nodes` for a pulse whose rows the sweep had already deleted — reporting "+5472/-0 symbols" for a three-minute-old comparison (ADR 0122). `fallback` filtered on `dna.fallbackAnalysis`, which 0 of 5,472 nodes carry (ADR 0123). `ledger` was PREDICTED to have this defect and did not, which is why the check is "look at the producer" rather than "assume the worst".

## CONDUCKS-39 — A finding from reading is a hypothesis until it is run
- Rule: A defect discovered by reading source is not recorded as a defect until the command has been executed and the behaviour observed. This applies to findings produced by greps and static scans over the codebase, including one's own tooling.
- Reason: Four findings were withdrawn in a single sweep after being written down. `query "*"` dropping containers was deliberate and documented. `guard --threshold` and `mcp --sse` were recorded as "advertised and never read" and both worked — the detector's regex missed a trailing `=` and a command that delegates flag reading one layer down, so the blind spot was in the detector (ADR 0120). `monitor` was nearly recorded for reporting a branch belonging to no part of this project; it belonged to another registered root and was correctly labelled, with the header cut off by the command used to read the output (ADR 0125). Leaving a wrong finding recorded costs the next reader the investigation plus the time spent trusting it.

## CONDUCKS-40 — score what was found WRONG, not only what was found
A recall number rises by attaching anything. The docstring join scored 496 attachments and looked
like a win; comparing the TEXT against the source showed 17 of them were `# ------` rules that had
beaten the real docstring. Any measurement of "did we find it" carries a paired measurement of "is
what we found correct", and a metric with no denominator of truth is a count, not a score.
Also: a number going DOWN is not automatically a regression. The TypeScript doc count fell by 13 when
banners started being refused. Look at what left before calling it either way. ADR 0135.

## CONDUCKS-41 — a check that has never failed may be incapable of failing
- Rule: A check written AFTER the fix it guards is not trusted until it has been seen RED. Break the
  thing it claims to protect, confirm that check — not merely some check — fails, then restore.
  Applies to unit tests, gate assertions and any harness written alongside a fix.
- Reason: MEASURED on a session's own work. Eleven checks were mutated; two were vacuous. "A scope
  naming no file exits non-zero" ran in an EMPTY directory, so the empty-ROOT refusal produced the
  non-zero exit whatever the scope logic did — deleting the scope refusal left it green. The
  module-hash test asserted `ProjectMonitor.moduleHash === moduleHashOf`, which after the
  consolidation compares a function to itself and cannot fail; making the hash ignore every file's
  content left it green. Both were written the same hour as their fixes, both looked like coverage,
  and neither could have caught a regression. CONDUCKS-39 makes a FINDING earn its record by being
  run; this makes the CHECK earn its tick by being broken.

## CONDUCKS-42 — a package that is imported is a package that is declared
- Rule: Every package `build/` imports appears in `dependencies` or `optionalDependencies`. Never rely
  on one arriving through another dependency's tree. A genuine exception is allowed only in the
  `ALLOWED` list of `scripts/check-declared-deps.mjs` and only with its reason written beside it.
- Reason: `minimatch` and `chalk` were imported by shipped code and declared nowhere, riding in
  through `duckdb` -> node-pre-gyp -> glob. Swapping that one dependency out took them with it, the
  repo's suite stayed green — the repo has them via devDependencies — and every real install died on
  `Cannot find package 'minimatch'`. A transitive package is not a promise: it disappears whenever the
  dependency carrying it changes its own tree, which is nobody's fault and comes with no warning. The
  repo is the one environment where the missing package is always present, so no test run inside it
  can see this. Enforced at postbuild, where a broken publish is still cheap.


## CONDUCKS-43 — dev tooling opens a vault through one helper, never its own driver call
- This is CONDUCKS-5 ("direct DuckDB calls are forbidden outside the persistence layer") extended to
  the one place it was never enforced. `tools/` and `scripts/` are outside `src/` and cannot reach the
  TypeScript persistence layer before a build, so they had no compliant option and 26 of them wrote
  their own driver call. The helper is that option; the rule is the same rule.
- Rule: anything under `tools/` or `scripts/` that reads a vault imports `openVault` from
  `tools/lib/vault.mjs`. No script constructs a DuckDB instance or connection itself. Read-only is the
  default and a writer must ask for it (`{ readOnly: false }`); a reader that takes the write lock
  fails against any repo with `conducks mcp` attached, which is whenever the tool is in use. The one
  exception is `tools/upstream-duckdb-repro/`, which is a bug report ABOUT the old driver and must
  keep importing it.
- Reason: the vault driver moved from `duckdb` to `@duckdb/node-api` (ADR 0149) and **26 files broke
  at once**, because each had hand-rolled `new duckdb.Database(...)` plus its own promisified `all`.
  Among them were `npm run benchmark` and `health.mjs`, the harness the frozen-subject baselines come
  from. None of them is covered by a test — dev tooling is what you reach for WHILE debugging, so it
  fails at the moment you need it and never before. One helper makes the next driver change one edit.
  — todo56
