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
- Rule: A skill in `src/resources/skills/` may name a `conducks_*` tool only if that tool exists in the registered MCP surface; the skills↔tools test fails the suite otherwise. `src/resources/skills/` is the only editable copy — `build/src/resources/skills/` and `~/.claude/skills/<name>/SKILL.md` are generated and must never be hand-edited.
- Reason: a wrong tool name in prose fails only when an agent tries the call, and then it reads as an agent error rather than a stale doc; five of eight skills once named six dead tools. The installer resolves `SKILLS_DIR` relative to its own compiled file, so `conducks setup` ships the build copy — editing a generated copy reinstalls stale guidance over current guidance. — ADR 0018

## CONDUCKS-16 — The kind taxonomy only grows
- Rule: `CanonicalKind` values are added, never renamed or removed. Numeric ranks may be resequenced (rank is relative ordering only); a new kind gets a deliberate rank, not the next free number. Removing or consolidating a kind is a separate migration with its own ADR.
- Reason: roughly two dozen call sites compare kind values as raw strings (`import-resolver`, `http-service-linker`, `mirror.engine`, `dead-code`, `query-service`), so a rename breaks them silently while the build stays green. Rank drives hierarchy, layer paths and several governance rules. — ADR 0003

## CONDUCKS-17 — Edge data lives on `.properties` and `.confidence`
- Rule: A `ConducksEdge` carries data on `.properties` and `.confidence`; `.metadata`/`.weight` do not exist on edges. Any change to edge persistence must assert the full save→load round-trip, not just the save side.
- Reason: reading `.metadata` at save wrote `properties={}` on every edge, and the mirror-image bug on load left all 4971 loaded edges with `properties === undefined`. A save-only test catches neither. `tests/unit/core/edge-roundtrip.test.ts` exists for exactly this.
