# Conventions — Structural Laws

Every rule has an ID, a statement, and the reason it exists.

---

## CONDUCKS-1
**Law:** No circular imports in Synapse Core (`src/lib/core/` and `src/registry/`).
**Reason:** Ensures atomic mirroring and prevents resonance leaks. Synapse must have zero external project dependencies.

## CONDUCKS-2
**Law:** Every Prism language lens must expose a `reflect()` method and an `extensions: string[]` array.
**Reason:** Facilitates discovery of structural lenses via the dynamic registry. Without a consistent interface, the registry cannot load lenses uniformly.

## CONDUCKS-3
**Law:** `ChronicleInterface` must only use git-direct commands for file discovery (e.g., `git cat-file --batch`). Non-git projects use the recursive FS fallback only.
**Reason:** Maintains high-fidelity synchronization with repository history. Mixing strategies produces unreliable discovery results.

## CONDUCKS-4
**Law:** All node IDs must be lowercase, absolute-normalized canonical FQNs: `lowercased/absolute/path.ts::classname.method`.
**Reason:** macOS APFS is case-insensitive. Mixed-case IDs cause structural graph fragmentation where `/Users/Said/` and `/users/said/` become distinct nodes, breaking cross-module links.

## CONDUCKS-5
**Law:** All persistence must implement the `SynapsePersistence` driver interface. Direct DuckDB calls are forbidden outside the persistence layer.
**Reason:** Allows storage swaps without breaking the Mirror Pulse. Enforces the Connect-Execute-Disconnect lifecycle to prevent lock contention.

## CONDUCKS-6
**Law:** All impact analysis must use Weighted Dijkstra. BFS/DFS-based traversal is forbidden for blast radius calculations.
**Reason:** Edge type weights (call=1.0, import=0.7, inheritance=1.2, db_write=1.5) encode structural risk. Unweighted traversal produces incorrect blast radius estimates.

## CONDUCKS-7
**Law:** Framework coverage must be aggregated via DuckDB vectorized SQL, not application-level loops.
**Reason:** Enables sub-second ecosystem-wide aggregation. Application-level loops degrade to O(n) on 100k+ node codebases.

## CONDUCKS-8
**Law:** The MCP server is strictly read-only. No write operations (`conducks analyze`, `conducks rename`, `conducks clean`) are exposed via MCP tools.
**Reason:** Write operations cause DuckDB lock contention when the MCP server holds a read connection. Isolating writes to the CLI eliminates locking conflicts. Enforced as Rule 6/13.

## CONDUCKS-9
**Law:** The MCP server must maintain exactly 9 unified tools. Adding or removing tools requires updating the Rule 10/13 metadata and `server.ts` registration.
**Reason:** Tool count is validated by the HyperToon registry. Drift from the declared count causes runtime registration failures.

## CONDUCKS-10
**Law:** `pulseId` is always system-injected in MCP tool execution. It is never accepted as a parameter from agents.
**Reason:** Prevents agents from accidentally or maliciously querying stale structural snapshots. The system always resolves to the latest pulse.

## CONDUCKS-11
**Law:** Worker threads must explicitly load their required WASM grammars (`typescript.wasm`, `python.wasm`, `go.wasm`) before commencing pulses. Grammar loading is not inherited from the parent thread.
**Reason:** The Grammar Bridge (v0.9.0) fix. Without explicit per-worker grammar loading, workers produce "Missing Grammar" nodes and the structural graph collapses.

## CONDUCKS-12
**Law:** All DuckDB connections use the Connect-Execute-Disconnect pattern. Connections must be released immediately after query execution.
**Reason:** Lazy persistence prevents database locking during parallel CLI + MCP server usage. Persistent connections block concurrent writes.
