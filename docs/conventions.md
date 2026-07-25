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

## CONDUCKS-9 — Fixed MCP tool count
- Rule: The MCP server must maintain exactly 9 unified tools. Adding or removing tools requires updating the Rule 10/13 metadata and `server.ts` registration.
- Reason: Tool count is validated by the HyperToon registry. Drift from the declared count causes runtime registration failures.

## CONDUCKS-10 — System-injected pulseId
- Rule: `pulseId` is always system-injected in MCP tool execution. It is never accepted as a parameter from agents.
- Reason: Prevents agents from accidentally or maliciously querying stale structural snapshots. The system always resolves to the latest pulse.

## CONDUCKS-11 — Explicit per-worker grammar loading
- Rule: Worker threads must explicitly load their required WASM grammars (`typescript.wasm`, `python.wasm`, `go.wasm`) before commencing pulses. Grammar loading is not inherited from the parent thread.
- Reason: The Grammar Bridge (v0.9.0) fix. Without explicit per-worker grammar loading, workers produce "Missing Grammar" nodes and the structural graph collapses. Grammar is cached per worker, not per file.

## CONDUCKS-12 — Connect-Execute-Disconnect for DuckDB
- Rule: All DuckDB connections use the Connect-Execute-Disconnect pattern. Connections must be released immediately after query execution.
- Reason: Lazy persistence prevents database locking during parallel CLI + MCP server usage. Persistent connections block concurrent writes. Never open two read-write connections at once: `conducks analyze` holds read-write, the MCP server read-only. `conducks clean` clears zombie handles when lock files accumulate.
