# Features — Conducks

Source of truth for all product capabilities. Read this before making any changes.

---

## 1. Analysis Domain

**conducks analyze** — Full structural pulse. Discovers files via Git (`git cat-file --batch`) or recursive FS fallback for non-git projects. Parses with Wasm Tree-sitter, builds Synapse graph, runs PageRank + Tarjan SCC, persists to DuckDB atomically. Multi-core Map-Reduce architecture (CPU-parallelized worker threads). Two-pass: Discovery wave (parallel) → Induction wave (global). Performance: 9s for 9,230 nodes / 61,352 edges.
- `--staged`: Incremental sync — only reflects staged files, not full repo.
- `--force`: Force full re-pulse regardless of staleness.
- `--verbose`: Fires real-time anomaly detection output during ingestion.

**conducks status** — Structural health manifest. Aggregates: hotspots (risk × gravity top symbols), entry points (REST routes, mains, CLI handlers), structural pillars, god object detection, anomaly summary, staleness ranking. Sub-command `--staleness` shows symbols by active tenure (commits since last change).

**Staleness Sensor** (`src/lib/domain/federation/context.ts`) — Verification engine that compares the last pulsed Git commit hash against the current `HEAD`. Calculates precise "commits behind" counts to detect if the graph is out of sync. Powers `conducks status` and `conducks context`.


**conducks watch** — Real-time FS monitoring. Delegates to `MicroPulseService` for sub-second structural resurrection of modified units. Auto-syncs graph on file change. Stabilized for macOS APFS case-sensitivity. Prevents persistence deadlocks via lazy connection lifecycle.

**MicroPulseService** (`src/lib/domain/analysis/micro-pulse.ts`) — Incremental single-file induction for the Mirror. Performs targeted `clearFile()` + re-reflect on a changed unit without a full pulse. Used by the watcher and the Mirror's GatewayService hot-reload.

**GatewayService** (`src/lib/domain/analysis/gateway-service.ts`) — Unified synapse access layer for the Mirror dashboard. Watches the DuckDB vault for structural changes and pushes PULSE events to all connected Mirror clients over SSE.

**FallbackDetector** (`src/lib/domain/analysis/fallback-detector.ts`) — Identifies fallback structural patterns via 5-signal analysis: pipeline position (called after primary fails), conditional execution context, error-handling nesting, naming pattern heuristics, and call ratio (primary vs fallback invocations). Tags nodes with `isFallback: boolean`.

---

## 2. Discovery Domain

**conducks query** — Symbol lookup by fuzzy match or regex against the Atom Map. Returns canonical FQN IDs (`path/to/file.ts::Class::method`). Supports namespace scoping to reduce noise in large codebases.

**conducks list** — Lists all indexed symbols with canonical rank, kind, risk score, and gravity.

**conducks entry** — Lists all detected entry points ranked by structural gravity. Entry point detection criteria: `__main__` blocks, framework-declared routes (FastAPI/Flask `@app.route`, Express `app.get()`), CLI command functions, NestJS/Angular decorators (`@Get()`, `@Controller()`), web server listeners.

**GQL Parser** (`src/lib/domain/intelligence/gql-parser.ts`) — Internal Structural Query Language. Used by MCP tools to execute named queries against the DuckDB synapse. Agents never write SQL — they call templates by name; the GQL parser injects `pulseId` and validates params.

**Search Engine** (`src/lib/domain/intelligence/search-engine.ts`) — Fuzzy and regex symbol search across the `name`, `file`, and `canonicalKind` columns. Returns ranked results with containment context (parent class, file, namespace).

---

## 3. Behavioral Tracing Domain

**conducks trace** — Weighted Dijkstra pathfinding. Finds the shortest functional bridge between two symbols. Edge weights: call=1.0, import=0.7, inheritance=1.2, db_write=1.5, pub_sub=1.3.
- `--target <id>`: Point-to-point trace.
- `flow`: Full downstream execution circuit from a symbol.
- Cross-module and cross-service (via Universal Resonance route/request node bridging).

**conducks impact** — Bidirectional blast radius analysis. Upstream: who calls this? Downstream: what does this call? Returns direct and transitive dependents with hop distance and risk score. Uses Weighted Dijkstra.

**conducks flows** — Groups symbols into logical execution units via `PULSES_TO` edge traversal. Identifies data lineage — traces variable producers (assignments) through to consumers (function arguments). Uses `FlowProcessor` to build execution circuits.

**FlowEngine** (`src/lib/domain/kinetic/flow-engine.ts`) — Core execution of `conducks flows` and `conducks trace flow`. Traverses `PULSES_TO` and `CALLS` edges to reconstruct data and execution pipelines.

**KineticTrace** (`src/lib/domain/kinetic/trace.ts`) — Implements the Dijkstra path resolver used by `conducks trace`. Supports upstream-only, downstream-only, and bidirectional traversal. Returns the shortest risk-weighted path with intermediate symbols.

---

## 4. Metrics Domain

**conducks explain** — 6-signal composite risk decomposition for any symbol.
- **Gravity**: PageRank structural centrality (0–1).
- **Complexity**: Cyclomatic branch-count score.
- **Entropy**: Shannon authorship concentration (single-author = high risk).
- **Churn**: Git commit frequency — how often has this changed?
- **FanOut**: Outbound edge count (too many dependencies).
- **Debt**: Count of TODO/FIXME/HACK/XXX/REFACTOR/DEPRECATED/BUG markers.
- Composite formula: `Risk = w1·Gravity + w2·Complexity + w3·FanOut + w4·Debt + w5·Churn + w6·Entropy`

**conducks entropy** — Shannon entropy per-symbol and per-file. Aggregates authorship concentration. `entropy = -Σ(p_i · log2(p_i))` where p_i is each author's share of commits on the symbol.

**conducks cohesion** — Structural similarity between two graph neighborhoods. Measures shared edge-type topology and structural overlap score. Used for refactoring target identification.

**TestAligner** (`src/lib/domain/metrics/test-aligner.ts`) — BFS-based coverage mapping. Traces from test nodes (files in `/tests/`) downstream up to depth 5 to find all production symbols covered. Populates `coveredBy: string[]` on each node. Bidirectional: test forward-links to production, production back-links to covering tests.

**Resonance Engine** (`src/lib/domain/metrics/resonance.ts`) — Project-level structural similarity. Computes topological signatures (layer distribution, edge density, gravity distribution) and similarity score between two synapses. Used by `conducks resonance`.

---

## 5. Governance Domain

**conducks audit** — Sentinel integrity checks via `sentinel.ts`.
- ARCH-3: Circular dependency detection (Tarjan SCC). Distinguishes between internal file cycles and genuine architectural circularity spanning multiple units.
- God object detection: symbols exceeding fanout threshold.
- Orphan exports: symbols with no incoming edges.
- Reads custom rules from `sentinel.json` at project root.
- **Advanced Sentinel Rules**: Supports `require_heritage` (enforce base classes), `require_caller` (enforce call-wrappers), `framework_check` (validate decorators), and `require_file` (foundation file checks).
- **Framework Coverage**: Aggregates usage statistics to show project-level adoption of detected frameworks (e.g., Next.js vs Express).
- `--mode archeology`: Longitudinal audit via `AuditService` — tracks structural velocity and decay trends across all historical pulses using windowed SQL (`LAG + AVG OVER PARTITION`).

**conducks fallback** — Specialized reporting on "Suspicious Fallback Patterns." Identifies legacy or obsolete fallbacks using a 5-signal confidence score. Reports: Fallback Confidence, Usage Ratio, Naming Score, and Tenure (days since creation). Provides prioritized removal recommendations.


**conducks advise** — Proactive structural improvement via `advisor.ts`. Heuristic recommendations:
- **Split Candidates**: Identified via `SplitScore(M)` (Betweenness + Entropy + Churn - Cohesion).
- **Hidden Coupling**: Surfaced from Git co-change matrix (Architectural Lies).
- **Structural Intuition**: Detects possible implicit links where string literals match symbol names.
- **Dependency Health**: Flags unpinned dependencies (`latest`, `*`, `^`) and heavy external coupling.
- **Dead Code**: Removal opportunities for orphaned exports.


**conducks verify** — Policy compliance verification. Checks all CONDUCKS-* structural laws against the current graph state.

**conducks guard** — CI/CD regression guard via `guard.ts`. Computes structural entropy delta between the current pulse and historical baseline. Returns Block/Pass verdict with signal breakdown. Enforces the `RegressionGuard` policy (user-defined entropy spike threshold).

**Guidance Oracle** (`src/lib/domain/governance/oracle.ts`) — Dynamic knowledge base. Recursively scans `src/resources/skills-generator/` for `.md` skill files at startup. Exposes indexed engineering standards to the MCP server and CLI help system. Auto-updates when skill files change — no server restart required.

**Config Detector** (`src/lib/domain/governance/config-detector.ts`) — Identifies project configuration patterns (build tools, test runners, linters) from the structural graph and file system, used to enrich context generation.

**Audit Service** (`src/lib/domain/evolution/audit-service.ts`) — Longitudinal structural velocity tracking. Reads pulse history from DuckDB, computes per-pulse ΔComplexity, ΔRisk, ΔEntropy with windowed SQL aggregates. Powers `conducks guard` and `conducks audit --mode archeology`. Memory-efficient: delta capping at Top 100 prevents OOM on 10k+ node codebases.

---

## 6. Evolution Domain

**conducks rename** — Graph-Verified Refactoring (GVR). Atomically renames a symbol across all proven callers. Dry-run by default; `--confirm` to apply. Traverses IMPORTS + CALLS edges. Rollback on failure.
- Known gap: `import type` edges are invisible — type-only references may be missed.

**conducks prune** — Dead code detection. Identifies orphaned exports (exported, never imported), unused imports, unreachable functions. Known false positive: `import type` CLI exports appear as orphans — expected behavior.

**conducks diff** — Chronoscopic structural diff between two pulse IDs. Reports: symbols added, removed, modified (by fingerprint hash comparison). Detects ΔComplexity, ΔGravity, ΔResonance. Uses `fingerprint = SHA256(file + name + dna)` for fast comparison.

**conducks drift** — Longitudinal drift analysis. Tracks structural velocity and decay across multiple historical pulses. Reports trending risk, entropy spikes, and architectural drift direction.

**GVR Engine** (`src/lib/core/algorithms/refactor/gvr-engine.ts`) — Core of `conducks rename`. Builds a blast radius from the target symbol via IMPORTS + CALLS traversal, then performs atomic multi-file string replacement with rollback on partial failure.

**Dead Code Engine** (`src/lib/domain/evolution/dead-code.ts`) — Powers `conducks prune`. Performs left-join analysis on edges to find symbols with no incoming edges, excluding entry points and exported symbols that are externally accessible.

**Watcher** (`src/lib/domain/evolution/watcher.ts`) — Powers `conducks watch`. Integrates with MicroPulseService for per-file re-induction. Resolved circular dependency (was a known stability issue), fixed persistence deadlocks via lazy lifecycle.

---

## 7. Intelligence Domain

**conducks query** (advanced) — Beyond basic symbol lookup:
- Named template mode: `conducks_query({mode: 'template', template: 'find_usages', params: {...}})` — 19 pre-built SQL templates, `pulseId` always system-injected.
- Filter mode: `conducks_query({mode: 'filter', filters: {canonicalKind, namespaceId, minRisk, ...}})` — typed filter builder, validated server-side (no raw SQL surface).

**conducks resonance** — Cross-repo structural similarity. Computes topological signature for each repo and returns a similarity score. Fixed: NaN formatting and path normalization.

**Co-Change Engine** (`src/lib/core/algorithms/cochange-engine.ts`) — Detects "Architectural Lies": files that change together in Git history but have no structural edge between them. Formula: `NCoChange(i,j) = Commits(i,j) / sqrt(Commits(i) · Commits(j))`. Surfaces hidden temporal coupling invisible to the structural graph.

**DAAC Clustering** (`src/lib/core/algorithms/clustering/daac.ts`) — Directory-Aware Agglomerative Clustering. Groups files into functional communities (Auth, Billing, Core) by combining call-density graph relationships with directory proximity. Used by `conducks blueprint` to identify architectural modules.

---

## 8. Visual Domain

**conducks mirror** — Real-time Kinetic Mirror dashboard at port 3333. Force-directed graph with full 9-layer taxonomy. Features:
- Adaptive semantic scaling: namespace labels always visible, file labels at zoom ≥ 0.6, symbol labels at zoom ≥ 1.2.
- Photon Path focusing: click a connection → dims all other nodes to 5% opacity, pulses the active path.
- Neon Glass sidebar: Namespace Search, Layer Toggles, Health Rings, Active Node Detail.
- Nearest Visible Parent (NVP) edge promotion: hidden-node edges promoted to visible ancestors.
- Skeleton & Meat: graph topology in RAM, full metadata streamed from DuckDB on-click.
- Read-only connection — no persistence writes during visualization.

**conducks visualize** — Generates `structural_mirror.md`: a static Mermaid diagram of the top-N gravity nodes (default: 30) with their 1-hop connections. Writes to `.conducks/structural_mirror.md`. Alternative to the live Mirror for agents or CI pipelines.

**conducks blueprint** — Generates `BLUEPRINT.md`: structural summary with node/edge counts, DAAC community clusters, entry points, governance audit results. Token-optimized for LLM context windows.

**conducks context-gen** — Generates `ARCHITECTURE.md`: LLM-optimized architecture context (≤4000 tokens). Covers layer distribution, hotspots, entry points, and structural risk summary. Written to the project root.

**Mirror Engine** (`src/lib/domain/visual/mirror.engine.ts`) — Server-side graph rendering layer. Implements **Nearest Visible Parent (NVP)** logic for structural contraction, promoting technical edges between filtered nodes to their visible ancestors. Powers the Mirror dashboard.


---

## 9. Documentation Domain

**conducks bootstrap-docs** — Initializes the 7-file documentation standard for a project via `ManifestEngine`. Creates `docs/project/<name>/` with: `vision.md`, `architecture.md`, `implementation.md`, `handover.md`, `conventions.md`, `todo.md`, `memory.md`. Skips files that already exist.

**ManifestEngine** (`src/lib/domain/manifest/manifest-engine.ts`) — Core of `conducks bootstrap-docs`. Creates each doc file with a structured template. Implements the Conducks documentation governance standard (DOCS-1).

---

## 10. System & Federation Domain

**conducks setup** — First-run installer via `conducks-installer.ts`. Configures `conducks.config.json`, creates `.conducks/` vault directory, validates Node.js version and WASM availability.

**conducks mcp** — Starts the MCP JSON-RPC server. Serves the 9 unified tools via the HyperToon registry with dynamic tool description loading from `src/resources/skills-generator/`.

**conducks clean** — Nuclear clean protocol. Drops the DuckDB vault, evicts zombie process handles (SIGKILL), removes lock files. Required before schema migrations or when lock contention is unresolvable.

**conducks record** — Records a structural pulse snapshot with a named label for chronoscopic analysis.

**conducks link** — Federated linking across multiple repositories via `FederatedLinker`. Performs **Additive Hydration** (append mode) — loads a second synapse into the current graph without overwriting. Resolves cross-synapse edges via post-pulse alignment. Verified: 5,000 foundation nodes merged into 1,624-node scraper synapse (6,624 total federated).

**conducks help** — Professional Structural Help Engine. Groups the 33 CLI commands into 9 distinct functional domains: Discovery, Landscape, Behavioral, Metrics, Governance, Historical, Mutational, Visual, and System.


**conducks context** — Displays the current workspace context: vault path, pulse ID, node/edge counts, staleness state.

**MCP Configurator** (`src/lib/domain/federation/mcp-configurator.ts`) — Manages installation of Conducks into MCP hosts (Claude Desktop, Cursor, etc.). Writes the correct `conducks.config.json` entry to the host's settings file via Dependency Injection.

---

## 11. Core Parsing Infrastructure

**Essence Lens** (`src/lib/core/parsing/essence-lens.ts`) — Extracts project-level metadata from manifest files. Parses `package.json` (dependencies, framework detection) and `requirements.txt` (Python packages, framework detection). Detects: Next.js, Express, FastAPI, Flask, Django. Creates `ECOSYSTEM` and `DEPENDS_ON` nodes/edges in the graph.

**Ignore Manager** (`src/lib/core/parsing/ignore-manager.ts`) — Manages structural exclusions. Default patterns: `node_modules/`, `dist/`, `build/`, `venv/`, `target/`, `vendor/`, `.git/`, and language-specific artifact dirs (Rust `target/`, Ruby `Gems/`, Swift `.build/`, .NET `bin/obj/`). Respects `.conducksignore` file at project root for custom exclusions.

**Grammar Registry** (`src/lib/core/parsing/grammar-registry.ts`) — Manages Tree-sitter WASM grammar loading and caching per worker thread. 14 grammars available: TypeScript, TSX, Python, Go, C, C++, C#, Java, Rust, Ruby, Swift, PHP, plus the base `tree-sitter.wasm`.

**Prism Processors** (`src/lib/core/parsing/processors/`) — Five specialized processors used by the Two-Pass Reflector:
- `binding.ts` — Neural Binding: resolves qualified cross-module calls (`pkg.sub.func`) to their origin exports.
- `call.ts` — CALLS edge extraction from function invocations.
- `import.ts` — IMPORTS edge extraction and module path resolution (ESM extension stripping, PEP 328/451).
- `flow.ts` — PULSES_TO edge extraction: links variable producers to consumers for data lineage.
- `heritage.ts` — EXTENDS/IMPLEMENTS edge extraction for class inheritance chains.

---

## 12. MCP Tools (9 Unified)

| Tool | Domain | Capabilities |
|:---|:---|:---|
| `conducks_status` | Analysis | Hotspots, pillars, entry points, layer distribution, anomalies |
| `conducks_query` | Discovery | Symbol lookup, namespace scoping, template mode, filter mode |
| `conducks_explain` | Metrics | 6-signal risk decomposition, bus factor, staleness |
| `conducks_impact` | Kinetic | Blast radius (upstream/downstream), hop distance, risk by path |
| `conducks_trace` | Kinetic | Pathfinding, execution circuits, data flow chains |
| `conducks_audit` | Governance | Sentinel checks, cycle detection, god objects, co-change lies, archeology mode |
| `conducks_evolution` | Evolution | GVR rename, structural diff by pulse, drift analysis |
| `conducks_system` | System | Architecture context, installer, multi-workspace federation |
| `conducks_link` | Federation | Federated repo linking, cross-synapse edge resolution |

HyperToon registry (`src/interfaces/tools/hypertoon.ts`) loads tool descriptions live from `src/resources/skills-generator/` markdown — updating docs auto-updates agent understanding without a server restart.

---

## 13. Structural Taxonomy (9 Layers)

| Rank | Kind | Language Examples |
|:---|:---|:---|
| L0 | ECOSYSTEM | Root project node, ecosystem package |
| L1 | REPOSITORY | Monorepo sub-service boundary |
| L2 | NAMESPACE | Folders, Python packages, Go packages |
| L3 | UNIT | Source files |
| L4 | INFRA | Routes (`@app.route`, `app.get()`), middleware, API handlers, CLI entry points |
| L5 | STRUCTURE | Classes, interfaces (TS/Java/C#), structs (Go/Rust/C), protocols (Swift) |
| L6 | BEHAVIOR | Functions, methods, goroutines (Go), closures |
| L7 | ATOM | Variables, constants, class properties, struct fields |
| L8 | DATA | Type aliases, interfaces (data shape), schemas, enums |

All constructs across all languages map to this universal taxonomy. A Python class and a Go struct are both `STRUCTURE` at `canonicalRank 5`. Cross-language MCP queries work without language-specific branching.

---

## 14. Language Support

| Language | Status | Key Structural Features |
|:---|:---|:---|
| **Python** | Production | PEP 328/451 import resolution, FastAPI/Flask routes, decorators, middleware, `@app.middleware` GUARDS edges, Two-Pass Reflector |
| **TypeScript / JS** | Production | ESM extension resolution, scoped `class.member` IDs, Next.js routes, Express/Fastify handlers, NestJS decorators, React components |
| **Go** | Production (v1.0.0) | Packages, structs, interfaces, `func` methods, goroutines, method receivers |
| **C** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **C++** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **C#** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **Java** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **PHP** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **Ruby** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **Rust** | Lens available | Grammar loaded; extractor, queries, resolver implemented |
| **Swift** | Lens available | Grammar loaded; extractor, queries, resolver implemented |

**Gnosis Fallback** — When Tree-sitter WASM crashes (e.g., C++ ABI mismatch on certain Node.js versions), the Gnosis semantic regex engine activates. Extracts CALLS, IMPORTS, and scope-aware mappings via multi-pass regex. Verified: restored edge connectivity from 248 to 6,814 edges (+2,600%) on affected environments.

---

## Known Gaps

| Gap | Priority |
|:---|:---|
| `import type` invisible to GVR blast radius — type-only refs have no runtime edges | High |
| `prune` false positives for `import type` CLI exports | Low |
| Query Template Library (19 named templates) not fully implemented | High |
| Filter builder for `conducks_query` mode not built | High |
| Dynamic dispatch — interface method calls can't resolve to concrete implementations | Low |
| Deep traversal (`deep_impact` recursive CTE) slower than precomputed Dijkstra | Medium |
| `0.00%` gravity/churn/entropy in `conducks impact` on fresh repos — needs `conducks analyze --force` after commits | Low |
