# CONDUCKS — Conducks: Complete Project Manifest 💎
### Gospel of Technology | Structural Intelligence Platform
### Written for a fresh agent session — assume zero prior context

---

## CRITICAL READING ORDER
Read this entire document before touching any code.
This document is the single source of truth.
Do not add features not listed here.
Do not change the phase order.
Do not modify this document unless explicitly instructed.

---

## What Is Conducks?

Conducks is a **Git-native, deterministic structural intelligence platform**.
It transforms source code into a living graph (called the Synapse) and then
reasons about that graph using formal mathematics — graph theory, information
theory, and statistical scoring.

**Core philosophy:**
- Zero LLMs in the analysis pipeline. Everything is deterministic and explainable.
- Every score decomposes into its signals. No black boxes.
- Python is the proving ground. Perfect it first, then expand to other languages.
- The registry-based architecture means new languages are drop-in lenses.
- Each phase builds on the previous. Do not skip phases.

**The three layers:**
- **Synapse (Core)**: Graph storage, algorithms, persistence (DuckDB)
- **Prism (Reflection)**: Language-specific parsers (Tree-sitter lenses)
- **Conducks (Intelligence)**: Analysis engines, MCP tools, CLI commands

**Dependency direction (never violate this):**
```
Conducks → Synapse & Prism
Prism → Synapse
Synapse has zero external project dependencies
```

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Primary store | DuckDB (SBP — Synapse Binary Prism) | All structural and metric data |
| Graph abstraction | Edge tables + DuckPGQ views | Graph queries without a graph DB |
| Language parsing | Tree-sitter (WASM) | Symbol extraction for all languages |
| Git integration | `git cat-file --batch` | Chronicle — history, blame, churn |
| CLI | Node.js / TypeScript ESM | All commands |
| MCP server | `lib/product/mcp/server.ts` | 8 unified agent tools |
| Visual layer | Mirror server port 3333 | Interactive graph dashboard |
| Algorithms | Custom TypeScript | All graph math — no external algorithm libs |

---

## File Structure

```
conducks/
├── src/
│   └── cli/
│       ├── index.ts              ← Single CLI entry point (unified in Phase 1)
│       └── commands/             ← One file per CLI command
├── lib/
│   ├── core/
│   │   ├── graph/
│   │   │   ├── adjacency-list.ts ← PageRank, Tarjan SCC, Neural Binding
│   │   │   ├── persistence.ts    ← DuckDB singleton, atomic transactions
│   │   │   └── diff-engine.ts    ← Chronoscopic structural diffing
│   │   ├── git/
│   │   │   ├── chronicle-interface.ts ← Git-direct file discovery + blame
│   │   │   └── cochange-engine.ts     ← Co-change matrix (architectural lies)
│   │   ├── algorithms/
│   │   │   └── entropy.ts        ← Shannon entropy calculations
│   │   ├── orchestrator.ts       ← Kahn's algorithm topological ingestion
│   │   └── policy/
│   │       └── sentinel.ts       ← Governance rule enforcement
│   └── product/
│       ├── indexing/
│       │   ├── reflector.ts      ← Two-pass neural reflector (core of parsing)
│       │   ├── graph-engine.ts   ← Structural resonance, route bridging
│       │   ├── languages/
│       │   │   └── python/       ← Python lens (extractor, processors)
│       │   └── processors/       ← call, import, flow processors
│       ├── analysis/
│       │   ├── advisor.ts        ← Conducks Advisor (cycles, hubs, lies)
│       │   ├── impact.ts         ← Weighted Dijkstra blast radius
│       │   ├── resonance.ts      ← Project similarity scoring
│       │   ├── dead-code.ts      ← Orphan detection
│       │   └── test-aligner.ts   ← BFS test-to-symbol coverage mapping
│       ├── mcp/
│       │   ├── server.ts         ← MCP server (HyperToon Registry)
│       │   └── tools/
│       │       ├── synapse.ts    ← analyze, query, governance, metrics tools
│       │       └── kinetic.ts    ← trace, evolution, system, link tools
│       └── mirror-server.ts      ← Visual dashboard server
├── skills/                       ← Agent skill prompt templates (Phase 5.6)
├── tools-structure/              ← Tool descriptions (source of truth for MCP)
├── tests/                        ← All integration and unit tests
└── docs/                         ← Governance manifest, conventions
```

---

## Completed Phases Summary

### ✅ Phase 0 — Identity
Proprietary naming (Synapse, Prism, Lens, Conducks, Chronicle).
Git-direct file discovery. Non-git recursive FS fallback.

### ✅ Phase 1 — Correctness & Governance
**Math implemented:**
- Tarjan's SCC: O(V+E) — catches A→B→C→A cycles, not just A↔B
- PageRank: iterative power iteration, damping=0.85, convergence 1e-6
- Shannon Entropy: authorship concentration per symbol
- Composite Risk Score: `Risk = w1·Gravity + w2·Complexity + w3·FanOut + w4·Debt + w5·Churn + w6·Entropy`
- Weighted Dijkstra: blast radius by edge type weight

**Edge weights:**
- `call` = 1.0, `import` = 0.7, `inheritance` = 1.2, `db_write` = 1.5, `pub_sub` = 1.3

**Infrastructure:**
- CLI unified into `src/cli/index.ts`
- DuckDB atomic persistence: all inserts in one transaction (15s → 325ms)
- Kahn's Algorithm: topological file ordering before parsing
- Two-Pass Neural Reflector: Pass 1 = scope mapping, Pass 2 = semantic dispatch
- Neural Binding: cross-module qualified path resolution (`pkg.sub.func`)
- Structural idempotency: `clearFile()` ensures identical graph on re-pulse
- GVR Engine: graph-verified atomic multi-file symbol renaming with rollback
- Sentinel: policy-driven architectural law enforcement
- Blueprint: auto-generates `BLUEPRINT.md`

### ✅ Phase 2 — Depth & Performance
**Math implemented:**
- Co-Change Matrix: `NCoChange(i,j) = Commits(i,j) / sqrt(Commits(i) · Commits(j))`
- PR Risk Engine: `PRRisk = α·E_new + β·Cycles_new + γ·Violations_new + δ·ΔBlastRadius`
- Variable Handover: `PULSES_TO` edges linking producers to consumers
- Microservice Bridge: virtual ROUTE + REQUEST nodes, heuristic URL matcher

**Performance achieved:**
- 2:18 → 9 seconds on 9,025 nodes / 61,352 edges (15x improvement)
- WASM initialized once per worker (not per file)
- Grammar cached per worker (not per file)
- PageRank runs once post-ingestion (not per batch)
- Parameterized batch inserts bypass V8 string limit (tested at 1.17M relationships)

**Verified on:**
- `stress_test` (non-git): 26 nodes, 26 edges — 100% correct
- `llm-engine` (git): 2,827 nodes, 4,426 edges — idempotent across runs
- `orchestrator` monorepo: 9,230 nodes, 61,352 edges — stable at 9s

### ✅ Phase 3 — Foundation Hardening (Python)
All items verified with integration tests before Phase 4 started.

- **3.1 Complexity Signal**: Branch-count extraction in Python lens Pass 2.
  `complexity` stored as first-class property on nodes in DuckDB.
- **3.2 Debt Signal**: Comment node capture during Tree-sitter traversal.
  `debtMarkers: string[]` attached to nearest enclosing symbol.
  Markers: TODO, FIXME, HACK, XXX, REFACTOR, DEPRECATED, BUG.
- **3.3 Git Blame first-class**: `git blame --porcelain` mapped to symbol line ranges.
  `primaryAuthor`, `authorCount`, `lastModified`, `tenureDays` on every node.
- **3.4 Test Alignment**: BFS-based TestAligner maps test suites to production symbols.
  Handles depth-3 chains: `test_main → App → Storage → DB.connect`.
  `coveredBy: string[]` on production nodes.
- **3.5 Forward Tracing**: `conducks trace <symbol>` for downstream flow.
  `conducks impact <symbol>` for upstream. Both directions verified as inverses.
- **3.6 Real-time Anomaly Detection**: Incremental SCC check after each Kahn level.
  `anomaly: 'cycle' | 'god_object' | null` field on nodes.
  Fires during `--verbose` output, not only post-pulse.
- **3.7 Route Mapping**: FastAPI + Flask route extraction. RESONATES_WITH edges verified.
- **3.8 Middleware Detection**: `@app.middleware` capture. `kind: 'middleware'`.
  GUARDS edges from middleware to protected routes.
- **3.9 Dependency Aligner**: Post-pulse alignment pass in FederatedLinker.
  Unresolved edge targets searched across all loaded synapses.
- **3.10 MCP 8 Unified Tools**: All tools connected. Selective Fidelity pattern planned.

**All 10 Phase 3 integration tests passed.**