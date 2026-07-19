# Features — conducks

## Full Structural Pulse
- Purpose: Build the symbol graph for a codebase in one pass so every other command has something to query.
- Intent: Repos this large make single-threaded, incremental-only parsing impractical — the pulse trades a one-time scan cost for near-instant queries afterward.

## Structural Taxonomy (System 1 — containment)
- Purpose: Model code as a containment tree where the deepest routinely-emitted node is the function (BEHAVIOR). Parameters/arguments/literals carry no architectural signal and are NOT nodes; variables/fields (ATOM) become nodes ONLY when they carry a real cross-scope reference edge — the rest are attributes on their parent.
- Intent: Keeps the graph at architectural altitude. Emitting every local variable floods the graph (~72% ATOM on a real repo) and buries the signal; edge-gating keeps only the atoms that are actually load-bearing. (ADR 0012/0013 — cut DATA, edge-gate ATOM.)

## Boundary / Supply-Chain Classification (System 2 — data flow)
- Purpose: Every reference that leaves the repo lands on a boundary node classified by origin — internal (resolves in-repo), stdlib (trusted, unversioned), or dependency (versioned, supply-chain-relevant, with package name). External imports become durable origin-tagged DEPENDS_ON edges.
- Intent: "Edge classification, not node count, tells architecture health." A dependency is only meaningful once you know it's third-party and versioned; this makes the supply-chain surface a queryable part of the graph instead of invisible. (ADR 0014.)

## Structural Health Status
- Purpose: One command that answers "what's wrong with this codebase right now" — hotspots, entry points, god objects, staleness — instead of making an agent assemble that picture from raw graph queries.
- Intent: Cuts the number of round-trips an agent needs before it can start reasoning about a codebase.

## Staleness Detection
- Purpose: Tells the user or agent when the persisted graph no longer reflects the current git state, before they act on stale context.
- Intent: Silent staleness is worse than an explicit warning — agents that reason over a drifted graph give confidently wrong answers.

## Live Watch Mode
- Purpose: Keeps the graph in sync automatically while a developer is actively editing, without re-running a full pulse per keystroke.
- Intent: Full pulses are too slow to run on every save; only the changed file needs to be re-inducted.

## Mirror Live Sync
- Purpose: Pushes graph changes to connected dashboard clients as they happen.
- Intent: A dashboard that requires manual refresh loses the value of live watch mode — the two are meant to be used together.

## Fallback Pattern Detection
- Purpose: Flags code that only exists to catch a primary path's failure, so it can be told apart from canonical logic during analysis.
- Intent: Fallback code inflates apparent complexity and risk scores if treated as equally important as the primary path it backs up.

## Symbol Query
- Purpose: Locate a symbol by fuzzy match, regex, or structured filter, and get back a canonical, addressable ID.
- Intent: Agents need a precise handle on "this exact symbol," not a text match — grep-style search can't disambiguate overloaded or shadowed names.

## Symbol Listing
- Purpose: Full inventory of indexed symbols ranked by risk and structural gravity.
- Intent: Supports triage workflows where a human or agent wants to scan the riskiest parts of a codebase rather than search for something specific.

## Entry Point Detection
- Purpose: Surfaces where execution actually begins — routes, CLI handlers, mains — across frameworks.
- Intent: Orients an agent unfamiliar with a codebase toward real starting points instead of making it guess from file names.

## Guarded Query Language
- Purpose: Gives MCP tools a fixed set of named query templates instead of a raw SQL surface.
- Intent: An LLM-driven agent should never be able to construct arbitrary SQL against the vault — templates bound what's queryable and keep `pulseId` system-controlled.

## Path Tracing
- Purpose: Finds the shortest functional bridge between two symbols, weighting edges by structural risk rather than treating every hop as equal.
- Intent: "How does A reach B" is a common but tedious question to answer by manually walking a call graph; risk-weighting favors the path that matters, not just the shortest one.

## Impact / Blast Radius Analysis
- Purpose: Reports who calls a symbol and what it calls, transitively, before a change is made.
- Intent: Lets an agent judge the risk of touching a symbol without needing to already know the codebase's structure.

## Execution & Data Flow Tracing
- Purpose: Groups symbols into logical execution units and traces where a piece of data comes from and where it ends up.
- Intent: Reconstructing a pipeline by reading call sites one at a time doesn't scale; this answers "where does this data come from" directly.

## Composite Risk Explanation
- Purpose: Decomposes why a symbol is considered risky into named, weighted signals (centrality, complexity, entropy, churn, fan-out, debt markers).
- Intent: A single risk number is not actionable on its own — showing which signal dominates tells a reviewer what to actually fix.

## Authorship Entropy
- Purpose: Measures how concentrated a symbol's authorship is.
- Intent: Single-author code is a bus-factor risk that structural metrics alone can't see; entropy makes that visible without reading git blame by hand.

## Structural Cohesion
- Purpose: Compares two graph neighborhoods for shared topology to suggest refactoring targets.
- Intent: Identifies "these two areas do similar things structurally" as a starting point for consolidation, rather than relying on naming conventions.

## Test Coverage Alignment
- Purpose: Maps which production symbols are actually exercised by which tests, bidirectionally.
- Intent: Line coverage tools tell you a line ran; this tells you what it verified structurally — useful when deciding if a change is safe.

## Cross-Project Resonance
- Purpose: Computes a structural similarity score between two codebases (or two snapshots) from their topological signatures.
- Intent: Lets a team ask "is this new project shaped like ones we've built before" without a line-by-line diff.

## Structural Integrity Audit
- Purpose: Runs a fixed set of architectural sanity checks (circular dependencies, god objects, orphan exports) plus any project-defined rules.
- Intent: Encodes house rules about architecture as enforceable checks instead of tribal knowledge that erodes as the team changes; supports a longitudinal mode to see if a codebase is trending better or worse.

## Fallback Reporting
- Purpose: Prioritizes fallback-tagged code for review or removal, scored by confidence and usage.
- Intent: Not all fallback code is legacy cruft — this ranks candidates instead of flagging everything equally, so cleanup effort goes where it matters.

## Structural Advisory
- Purpose: Proactively recommends split candidates, exposes hidden coupling, and flags unpinned or heavy dependencies.
- Intent: Turns passive metrics into concrete suggestions — a risk score alone doesn't tell you what action to take.

## Policy Verification
- Purpose: Checks the current graph against the project's declared structural laws.
- Intent: Gives a yes/no compliance answer instead of requiring a human to manually re-check every convention after each change.

## CI Regression Guard
- Purpose: Compares structural entropy between the current pulse and a historical baseline, returning a block/pass verdict for CI.
- Intent: Catches architectural regressions (not just failing tests) before they merge, using a threshold the team defines.

## Guidance Oracle
- Purpose: Indexes the project's own engineering-standard documents and exposes them to the CLI help system and MCP tools.
- Intent: Keeps house standards discoverable and living — updating a skill file updates the guidance everywhere without a restart.

## Config Detection
- Purpose: Identifies the project's build tools, test runners, and linters from the graph and filesystem.
- Intent: Downstream context generation needs to know the project's toolchain without a human specifying it manually.

## Graph-Verified Rename
- Purpose: Renames a symbol across every proven caller, atomically, with a dry run by default.
- Intent: Text-based rename tools miss or over-match; verifying against the call graph before writing keeps a rename from silently breaking callers it can't see (e.g. type-only references).

## Dead Code Detection
- Purpose: Finds exported symbols with no incoming edges, excluding entry points and externally-accessible exports. Guards against false positives: method-dispatch (a dangling `receiver.method` protects the method name), test fixtures (tests/, spec, mocks, polyglot-verify), and identifier-as-value references (callbacks, DI tables) all count as usage.
- Intent: Removing dead code by hand requires knowing every caller exists — this makes "nothing calls this" a checkable fact instead of a guess. A prune tool is only trustworthy if it errs toward under-reporting; the guards keep dynamically-dispatched and entry-wired symbols from reading as dead.

## Supply-Chain Surface
- Purpose: `conducks supply-chain` reports the boundary classification — stdlib vs third-party edge surface, dependencies ranked by blast radius (importing files), versions joined live from package.json, and PHANTOM dependencies (imported but undeclared in the manifest).
- Intent: Turns the dependency graph into an actionable supply-chain view — which packages are load-bearing, which are undeclared — without a separate SCA tool. Built on the System 2 boundary edges.

## Workspace Ledger
- Purpose: `conducks ledger` gives a workspace-level survey and a single letter grade — node/edge counts, density, kind distribution, third-party surface, and orphan dead-weight — with the score deductions shown.
- Intent: A "state of the codebase" glance assembled from the graph the pulse already produced, so health is one command instead of a manual assembly of separate queries.

## Structural Diff
- Purpose: Compares two pulses and reports symbols added, removed, or modified, plus deltas in complexity, gravity, and resonance.
- Intent: Gives a structural, not textual, view of what changed between two points in history — useful for reviewing the shape of a change, not just its lines.

## Longitudinal Drift Analysis
- Purpose: Tracks structural velocity and decay trends across many historical pulses.
- Intent: A single snapshot can't show direction — this answers "is the architecture getting healthier or worse over time."

## Advanced Query Modes
- Purpose: Adds a typed filter builder and named-template mode on top of basic symbol query.
- Intent: Covers query patterns that fuzzy/regex search can't express, while still keeping the query surface bounded (no raw SQL) for agent use.

## Co-Change / Architectural Lies Detection
- Purpose: Finds files that change together in git history despite having no structural edge between them.
- Intent: Surfaces coupling the code graph is structurally blind to — two files can be tightly coupled in practice while looking independent on paper.

## Directory-Aware Clustering
- Purpose: Groups files into functional communities by combining call density with directory proximity.
- Intent: Neither call graph alone nor directory structure alone reliably identifies a module's real boundaries; combining both gives a better approximation, and feeds blueprint generation.

## Live Mirror Dashboard
- Purpose: Interactive, force-directed visualization of the full graph with zoom-aware labeling and click-to-focus paths.
- Intent: Some structural questions ("what's connected to what, at what scale") are faster to answer visually than by querying — the dashboard is read-only so it can't be mistaken for a source of truth.

## Static Structural Diagram
- Purpose: Generates a static Mermaid diagram of the highest-gravity nodes and their immediate connections.
- Intent: Gives agents and CI pipelines a lightweight, file-based alternative to the live Mirror when a running dashboard isn't available.

## Architectural Blueprint Summary
- Purpose: Produces a structural summary (clusters, entry points, audit results) sized for an LLM's context window.
- Intent: Full graph dumps blow context budgets; the blueprint is the compressed version an agent actually needs to orient itself.

## LLM Context Generation
- Purpose: Writes a bounded-size architecture summary to the project root for consumption by coding agents.
- Intent: Every agent session re-deriving architecture from scratch wastes tokens and time; this makes that context reusable and current.

## Docs Bootstrap
- Purpose: Initializes the project's documentation file set from templates, without overwriting files that already exist.
- Intent: Removes the blank-page problem for teams adopting the docs standard, while never clobbering docs someone has already written.

## First-Run Setup
- Purpose: Configures the project for conducks on first use — config file, vault directory, environment validation.
- Intent: Keeps onboarding to a single command instead of a manual checklist of prerequisites.

## MCP Server
- Purpose: Exposes conducks' query and analysis capabilities to MCP-compatible agent hosts.
- Intent: Lets coding agents use conducks as a tool rather than a human-operated CLI, without giving them write access to the vault.

## Vault Clean / Reset
- Purpose: Drops the vault and clears zombie process locks so a fresh pulse can run.
- Intent: Schema migrations and unresolvable lock contention need a clean-slate escape hatch rather than manual file surgery.

## Pulse Snapshot Recording
- Purpose: Records a named, labeled snapshot of the current pulse for later comparison.
- Intent: Lets a team mark meaningful points in history (a release, a refactor) instead of relying on commit hashes to find them later.

## Federated Repo Linking
- Purpose: Merges a second repository's graph into the current one without overwriting either, resolving cross-repo edges.
- Intent: Multi-repo systems have real structural connections that a single-repo pulse can't see; federation makes those connections queryable.

## CLI Help System
- Purpose: Groups all CLI commands into functional domains for discoverability.
- Intent: A flat command list doesn't communicate intent; grouping by domain (analysis, governance, visual, etc.) helps a new user find the right command faster.

## Context Display
- Purpose: Shows the current workspace's vault path, pulse ID, node/edge counts, and staleness at a glance.
- Intent: A fast sanity check before running anything else — answers "what am I actually querying right now."

## MCP Host Configuration
- Purpose: Installs and configures conducks into MCP hosts (Claude Desktop, Cursor, etc.).
- Intent: Removes manual JSON-editing from the setup path for connecting conducks to an agent host.

## Project Metadata Extraction
- Purpose: Reads manifest files (package.json, requirements.txt) to detect the project's frameworks and dependencies.
- Intent: Framework detection feeds config detection and context generation — without it, those features would need a human to specify the stack manually.

## Structural Exclusions
- Purpose: Lets a project exclude directories (build artifacts, dependencies, vendored code) from analysis by default, with a project-level override file.
- Intent: Without exclusions, generated and vendored code would dominate risk/hotspot rankings and drown out the project's own code.

## Regex Parsing Fallback
- Purpose: Keeps structural extraction working even when a Tree-sitter grammar fails to load or crashes for a given environment.
- Intent: A hard parser failure would otherwise silently degrade a whole language to file-only nodes; the fallback trades precision for still getting usable CALLS/IMPORTS edges.
