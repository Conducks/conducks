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
- Rule: anything in `optionalDependencies` — today `tree-sitter` and the 12 `tree-sitter-*` grammars — is reached only by `import type` (erased at compile) or by a lazy `require` inside a function, wrapped in `try/catch`, behind a cached loader. One loader per optional package: `GrammarRegistry.loadNative()` is the only place that touches the binding, and `isNativeAvailable()` is how callers ask. Absence is a supported state with a defined degrade (native → Gnosis regex extractor), never an error path. `tests/unit/core/parsing/optional-native-binding.test.ts` fails the build on any value import of a `tree-sitter*` package.
- Reason: ESM resolves every static import before the first line of a module executes, so a `try/catch` inside the module cannot protect it — an absent optional dep kills the process at load with `ERR_MODULE_NOT_FOUND`, before the fallback that exists to handle it can run. And on the machines where this fires, the test suite that would have caught it cannot run either. It held by accident for a long time: `Parser` happened to appear only in type positions in 12 files, so `tsc` erased those imports; one `new Parser()` would have turned a graceful degrade into a dead CLI. — ADR 0027
