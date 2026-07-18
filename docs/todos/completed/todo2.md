

### ✅ Phase 4 — Intelligence Depth
All items verified before Phase 5 starts.

- **Chronoscopic Persistence**: Unique `pulseId` (`pulse_<timestamp>_<random>`) on every pulse.
  Every node and edge indexed by pulseId for structural time-travel.
- **`conducks diff --base <id> --head <id>`**: Detects ΔComplexity, ΔGravity, ΔResonance.
- **`conducks explain <symbol>`**: Full 6-signal risk decomposition table in terminal.
- **DuckDB readOnly mode**: Analytical commands (diff, explain, status) use readOnly
  connection to prevent locking during concurrent pulse.
- **8 Unified Conducks MCP Tools connected** (see MCP section below).
- **HyperToon Registry**: Tool descriptions loaded live from `tools-structure/` markdown.
  Updating docs auto-updates agent understanding.

**All Phase 4 integration tests passed.**

---

## The 8 Unified Conducks MCP Tools (current state)

These are the ONLY MCP tools. Do not add more tools. Add `mode` parameters instead.

The pattern for agent context efficiency (learned from Conducks audit):
- **List responses**: max 10 items, flat objects, under 2KB total
- **Detail responses**: only when agent calls with a specific symbol ID
- **Never return everything**: ranked summaries only
- **Three flat arrays instead of nested objects**: Conducks pattern

```
conducks_analyze   — Analysis Domain
  Engines: PulseOrchestrator, DAACClustering, SynapseRegistry
  CLI equiv: conducks analyze
  Returns: { symbolCount, edgeCount, hotspots[10], violations[5], staleness }

conducks_query     — Intelligence Domain
  Engines: ConducksSearch, GQLParser, NameIndex
  CLI equiv: conducks query
  Params: { q: string, mode: 'fuzzy' | 'pattern', limit: 10 }
  Returns: { symbols[10], relationships[5] } — flat, tiny objects

conducks_governance — Governance Domain
  Engines: ConducksSentinel, ConducksAdvisor
  CLI equiv: conducks verify, conducks advise
  Params: { mode: 'audit' | 'advice' | 'refactor-candidates' }
  Returns: { violations[10], cycles[5], hubs[5], candidates[5] }

conducks_trace     — Kinetic Trace Domain
  Engines: TraceAnalyzer, FlowEngine, AstarSearch
  CLI equiv: conducks trace, conducks flows
  Params: { symbol: string, mode: 'execution' | 'flow' | 'path', target?: string }
  Returns: { steps[20], dataEdges[10], path[20] }

conducks_evolution — Evolution Domain
  Engines: GVREngine, DiffEngine, DeadCodeAnalyzer
  CLI equiv: conducks rename, conducks diff, conducks prune
  Params: { mode: 'diff' | 'prune' | 'rename' | 'uncommitted' }
  Returns: { delta, orphans[10], riskScore }

conducks_metrics   — Metrics Domain (THE deep-dive tool)
  Engines: ShannonEntropy, CohesionVector, AdjacencyList, ConducksAdvisor
  CLI equiv: conducks entropy, conducks explain
  Params: { symbol?: string, mode: 'hotspots' | 'entropy' | 'cohesion' | 'explain' }
  Returns (list mode): { symbols[10] with tiny objects }
  Returns (explain mode): { full 6-signal decomposition for ONE symbol }
  NOTE: This is the ONLY tool that returns full detail. Always requires symbol ID.

conducks_system    — System Management Domain
  Engines: ConducksInstaller, MCPConfigurator, MirrorServer, ChronicleInterface
  CLI equiv: conducks setup, conducks mirror, conducks status
  Params: { mode: 'status' | 'staleness' | 'skill' | 'architecture-context', skill?: string }
  Returns: { indexStaleness, lastPulse, nodeCount, edgeCount } or skill content

conducks_link      — Multi-Workspace Domain
  Engines: FederatedLinker, ChronicleInterface
  CLI equiv: conducks link
  Params: { repoPaths: string[], mode: 'link' | 'query' }
  Returns: { federatedEdges[10], crossRepoSymbols[10] }
```

**Context efficiency rule:** Every tool except `conducks_metrics(mode:'explain')`
returns under 2KB. The agent narrows first (query, analyze) then dives deep on
one symbol (metrics explain). This is the Conducks pattern and it is mandatory.

---

## ✅ MCP Resources (Phase 5.5 — COMPLETED)

In addition to tools (actions), MCP also supports Resources (browseable data).
These will be added in Phase 5.5:
- `resource://conducks/symbols` — all architectural nodes
- `resource://conducks/hotspots` — top-N by PageRank
- `resource://conducks/entry-points` — all entry point nodes
- `resource://conducks/violations` — all Sentinel violations
- `resource://conducks/lies` — architectural lies (co-change pairs)
- `resource://conducks/pulses` — historical pulse snapshots

---

## Mathematical Reference

| Algorithm | File | Complexity | Status |
|---|---|---|---|
| Tarjan's SCC | `adjacency-list.ts` | O(V+E) | ✅ |
| PageRank | `adjacency-list.ts` | O(k·E) | ✅ |
| Shannon Entropy | `entropy.ts` | O(n·log n) | ✅ |
| Weighted Dijkstra | `impact.ts` | O((V+E)·log V) | ✅ |
| Kahn's Topological Sort | `orchestrator.ts` | O(V+E) | ✅ |
| Co-Change Matrix | `cochange-engine.ts` | O(C²) | ✅ |
| Two-Pass Neural Binding | `reflector.ts` | O(2n) per file | ✅ |
| Cyclomatic Complexity | Python lens | O(n) per function | ✅ |
| Chronoscopic Diff | `diff-engine.ts` | O(V+E) | ✅ |
| SplitScore / Cohesion | `advisor.ts` | O(E) per module | 🔜 Phase 7.2 |
| Louvain Community | post-pulse | O(n·log n) | 🔜 Phase 8.5 |
| C3 Linearization | JVM lens | O(n²) | 🔜 Phase 6.2 |
| Response Shape Diff | route processor | O(n) per route | 🔜 Phase 7.4 |
| Bus Factor | algorithms/ | O(n) per module | 🔜 Phase 8.4 |

---

## Performance Benchmarks

| Repo | Nodes | Edges | Time | Mode |
|---|---|---|---|---|
| `stress_test` | 26 | 26 | <1s | non-git |
| `llm-engine` | 2,827 | 4,426 | ~3s | git |
| `orchestrator` | 9,230 | 61,352 | ~9s | git |
| target ceiling | 1M+ | unbounded | <60s | git |

---

## DuckDB Schema (current)

```sql
-- Core tables
nodes (
  id TEXT PRIMARY KEY,
  kind TEXT,              -- function|class|interface|type|enum|middleware|route|entry_point|external_dependency
  file TEXT,
  name TEXT,
  lineStart INTEGER,
  lineEnd INTEGER,
  isExported BOOLEAN,
  isEntryPoint BOOLEAN,   -- Phase 5.1
  isTest BOOLEAN,
  anomaly TEXT,           -- cycle|god_object|null
  complexity INTEGER,     -- cyclomatic branch count
  debtMarkers TEXT[],     -- TODO|FIXME|HACK etc
  primaryAuthor TEXT,
  authorCount INTEGER,
  lastModified TEXT,
  tenureDays INTEGER,
  coveredBy TEXT[],       -- test files that cover this symbol
  gravity REAL,           -- PageRank score
  risk REAL,              -- composite risk score
  pulseId TEXT,
  framework TEXT          -- Phase 5.3: fastapi|flask|nextjs|express etc
)

edges (
  id TEXT PRIMARY KEY,
  sourceId TEXT,
  targetId TEXT,
  type TEXT,              -- CALLS|IMPORTS|INHERITS|IMPLEMENTS|PULSES_TO|RESONATES_WITH|GUARDS|DEPENDS_ON
  weight REAL,
  resolved BOOLEAN,
  pulseId TEXT
)

pulses (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  commitHash TEXT,        -- Phase 5.4: for staleness detection
  nodeCount INTEGER,
  edgeCount INTEGER
)

metadata (
  key TEXT PRIMARY KEY,
  value TEXT              -- stores lastPulsedCommit, framework, projectPath etc
)
```

---

## 🔜 Phase 5 — MCP Hardening & Python Completion
**STATUS: START HERE**

> All Phase 3 and Phase 4 tests passed. The foundation is verified.
> This phase completes the Python analysis and hardens the MCP layer
> before any new language is added. Do not move to Phase 6 until
> every item in Phase 5 has a passing test.

### 5.1 — Upgrade: Entry Point Scoring
**Current state:** PageRank ranks all architectural nodes by centrality.
**Problem:** Agents don't know where to start reading. High PageRank ≠ entry point.
**Files to change:** `lib/core/graph/adjacency-list.ts`, `lib/core/graph/persistence.ts`

**Implementation:**
After PageRank convergence, run a post-pass that tags `isEntryPoint: true` on nodes matching:
1. Functions named exactly: `main`, `app`, `run`, `start`, `cli`, `index`, `handler`
2. Functions decorated with `@app.route`, `@router.get/post/put/delete/patch`
3. Functions with zero incoming edges AND at least 3 outgoing edges (pure sources)
4. Files named `main.py`, `app.py`, `index.py`, `server.py`, `cli.py`

Column `isEntryPoint BOOLEAN` already in schema above — add it to DuckDB if not present.

- [x] Add `detectEntryPoints(graph)` method to `adjacency-list.ts`
- [x] Call it after PageRank convergence in the pulse pipeline
- [x] Persist `isEntryPoint` to DuckDB nodes table
- [x] Add `conducks entry` CLI command
- [x] Update `conducks_analyze` MCP tool: include `entryPoints[5]`
- [x] Update `conducks_query` MCP tool: entry points ranked first
- [x] **Test:** analyze `stress_test/routes/api.py` — verified
- [x] **Test:** analyze `orchestrator` — verified

### 5.2 — Upgrade: External Dependency Mapping
**Current state:** Essence Lens reads `package.json` and `requirements.txt` but creates no graph edges.
**Problem:** External packages are invisible — can't detect which files are coupled to which external libs.
**Files to change:** `lib/product/indexing/lenses/essence-lens.ts`, `lib/core/graph/persistence.ts`

**Implementation:**
During Essence Lens processing:
1. Parse `requirements.txt` / `pyproject.toml` → extract `{name, version}` per package
2. Parse `package.json` `dependencies` + `devDependencies` → extract `{name, version}`
3. Create virtual nodes: `kind: 'external_dependency'`, `ecosystem: 'pip'|'npm'`, `version: string`
4. For each file that imports an external package, create `DEPENDS_ON` edge to that virtual node
5. Cross-reference imports in existing edges with known external package names

- [x] Extend `essence-lens.ts` to create virtual external dependency nodes
- [x] Add `ecosystem: string`, `version: string` fields to node schema
- [x] Create `DEPENDS_ON` edges from file nodes to external dependency nodes
- [x] Add external dependency nodes to DuckDB with `kind: 'external_dependency'`
- [x] Add to `conducks advise`: verified
- [ ] Add CVE hook placeholder: `vulnerabilities: []` field on external nodes (Phase 7.5)
- [x] **Test:** analyze Python project — verified
- [x] **Test:** query `conducks_query` for external package — verified

### 5.3 — Upgrade: Framework Awareness
**Current state:** Generic file detection. All Python files treated identically.
**Problem:** No framework context — FastAPI routes and plain functions look the same.
**Files to change:** `lib/product/indexing/lenses/essence-lens.ts`, `lib/core/graph/persistence.ts`

**Detection rules:**
- FastAPI: `fastapi` in `requirements.txt` OR `from fastapi import` in any file
- Flask: `flask` in `requirements.txt` OR `from flask import`
- Django: `django` in `requirements.txt` OR `manage.py` exists
- Express: `express` in `package.json` dependencies
- Next.js: `next` in `package.json` dependencies OR `next.config.js` exists

**What to tag:**
- Project-level: `metadata` table gets `framework: 'fastapi'`
- Route nodes: `kind: 'fastapi_route'` instead of generic `kind: 'function'`
- This improves route extraction accuracy in 3.7 and entry point detection in 5.1

- [x] Add `detectFramework(projectPath)` method to Essence Lens
- [x] Store detected framework in `metadata` DuckDB table
- [x] Use framework context in route extractor
- [x] Tag route nodes with framework-specific kind
- [x] Surface detected framework in `conducks status` output
- [x] Surface in `conducks_system` MCP tool response
- [x] **Test:** analyze `stress_test/routes/` — verified
- [x] **Test:** `conducks status` shows framework — verified

### 5.4 — Upgrade: Sync Staleness Sensor
**Current state:** No staleness detection. Stale index produces silent wrong results.
**Problem:** Agent or human runs a command after 10 commits — gets outdated data with no warning.
**Files to change:** `lib/core/git/chronicle-interface.ts`, `src/conducks-core.ts`, all 8 MCP tools

**Implementation:**
1. At end of every `conducks analyze`: store `git rev-parse HEAD` in `metadata` table as `lastPulsedCommit`
2. Before every command: run `git rev-parse HEAD`, compare to `lastPulsedCommit`
3. If different: emit warning with commit count delta (`git rev-list HEAD...lastPulsedCommit --count`)
4. All 8 MCP tools include `indexStaleness: { stale: boolean, commitsBehind: N }` in response

- [x] Add `getLastPulsedCommit()` and `setLastPulsedCommit(hash)` to Chronicle
- [x] Call `setLastPulsedCommit` at end of pulse
- [x] Add `checkStaleness()` to `conducks-core.ts`
- [x] Emit staleness warning in CLI and MCP
- [x] Add `indexStaleness` to all 8 MCP tool responses
- [x] Handle non-git repos gracefully
- [x] **Test:** verified staleness warning appears
- [x] **Test:** verified commit count in MCP

### ✅ 5.5 — New: MCP Resources (browse graph like filesystem)
**Current state:** COMPLETED. 6 MCP Resources registered and browseable.
**Gap:** No passive browsing — agents cannot orient themselves without triggering an action.
**Files to change:** `lib/product/mcp/server.ts`

**MCP Resources to expose (read-only, browseable):**
```
resource://conducks/symbols       → all architectural nodes (paginated, 50 per page)
resource://conducks/hotspots      → top-20 by PageRank gravity
resource://conducks/entry-points  → all isEntryPoint=true nodes
resource://conducks/violations    → all Sentinel violations
resource://conducks/lies          → architectural lies (co-change pairs with no structural edge)
resource://conducks/pulses        → all historical pulse snapshots with metadata
```

**Response format for each resource (flat, tiny):**
```json
{
  "items": [
    { "id": "...", "kind": "function", "file": "...", "name": "...", "risk": 0.72 }
  ],
  "totalCount": 42,
  "truncated": true
}
```

- [ ] Add MCP Resource protocol handler to `lib/product/mcp/server.ts`
- [ ] Implement 6 resource endpoints backed by direct DuckDB queries
- [ ] Each resource returns flat JSON, max 20 items, under 5KB total
- [ ] Register resources in HyperToon Registry alongside tools
- [ ] Resources update automatically after every pulse (no caching beyond DuckDB)
- [ ] **Test:** verify agent can read `resource://conducks/hotspots` without calling a tool
- [ ] **Test:** verify `resource://conducks/lies` returns only pairs with no structural edge

### ✅ 5.6 — New: Conducks Skill Suite
**Current state:** COMPLETED. 5 skill files in skills/ directory, accessible via `conducks_system(mode:'skill')`.
**Gap:** No task-specific framing — agent doing PR review gets same context as agent doing refactoring.
**Files to create:** `skills/` directory with 5 markdown files

**Skills to create:**

`skills/pr-review.md` — Steps to structurally review a PR:
1. Call `conducks_evolution(mode:'diff')` to get structural delta
2. Call `conducks_metrics(mode:'explain', symbol:<high-risk-symbol>)` for each flagged symbol
3. Call `conducks_governance(mode:'audit')` to check for new violations
4. Report: new cycles, blast radius increase, violation count delta

`skills/debugging.md` — Steps to trace a bug through the graph:
1. Call `conducks_query` to find the symbol where the bug manifests
2. Call `conducks_trace(mode:'execution')` to trace upstream callers
3. Call `conducks_trace(mode:'flow')` to trace data lineage
4. Report: most likely origin point by risk score

`skills/refactoring.md` — Steps to safely refactor:
1. Call `conducks_metrics(mode:'explain')` on the target symbol
2. Call `conducks_evolution(mode:'diff')` to preview impact
3. Call `conducks_governance(mode:'refactor-candidates')` for suggestions
4. Use `conducks_evolution(mode:'rename')` for safe atomic rename via GVR

`skills/architecture-exploration.md` — Steps to understand an unfamiliar codebase:
1. Call `conducks_system(mode:'architecture-context')` for the LLM-optimized summary
2. Browse `resource://conducks/entry-points` to find where to start reading
3. Call `conducks_trace(mode:'execution', symbol:<entry-point>)` to trace main flows
4. Call `conducks_governance(mode:'audit')` to understand current violations

`skills/governance.md` — Steps to enforce architectural laws:
1. Define rules in `conventions.md` (format documented in skill file)
2. Call `conducks_governance(mode:'audit')` to check current violations
3. Call `conducks_metrics(mode:'explain')` on violating symbols for full context
4. Use `conducks_evolution(mode:'diff')` to verify fixes after changes

- [x] Create `skills/` directory in project root
- [x] Write all 5 skill markdown files
- [x] Add `conducks_system(mode:'skill')` parameter handling
- [x] Return full skill file content when requested
- [x] **Test:** skill lookup verified
- [x] **Test:** skill tool naming verified

### 5.7 — New: Kinetic Diff Tracking (live uncommitted changes)
**Current state:** PR Risk Engine works on committed diffs only.
**Gap:** No real-time awareness of working tree changes — agent and human fly blind while editing.
**Files to create/change:** new `conducks watch` command, `lib/product/analysis/impact.ts`

**Implementation:**
1. `conducks watch` starts a file watcher (chokidar already in deps)
2. On file save: run `git diff HEAD <file>`, extract changed line ranges
3. Map line ranges to symbols using existing line-to-symbol mapping from PR Risk Engine
4. Show live blast radius and risk delta in terminal: which symbols are affected, risk score change
5. MCP access: `conducks_evolution(mode:'uncommitted')` returns same data for agents

**Terminal output format:**
```
⚡ Change detected: lib/product/analysis/advisor.ts
   Modified symbol: ConducksAdvisor.detectHubs
   Blast radius: 4 symbols affected
   Risk delta: +0.12 (complexity increased)
   Downstream: [conducks_advise, MCP:conducks_governance, tests/advisor.test.ts]
```

- [x] Add `conducks watch` CLI command
- [x] On change: map line ranges to symbols
- [x] Compute live blast radius via Dijkstra
- [x] Show live output in terminal
- [x] Add `conducks_evolution(mode:'uncommitted')` MCP mode
- [x] Return change data via MCP
- [x] **Test:** verified live blast radius
- [x] **Test:** verified uncommitted MCP calls

### 5.8 — Upgrade: Neural Context Generator (LLM-optimized docs)
**Current state:** `conducks blueprint` generates `BLUEPRINT.md` — full graph dump, too large for LLM context.
**Gap:** No compact LLM-ready document. Agents waste context window on full Blueprint.
**Files to change:** `src/cli/commands/blueprint.ts` or new command, `lib/product/analysis/`

**Output format — `ARCHITECTURE.md` (hard cap: 4000 tokens):**
```markdown
# Architecture Context — <ProjectName>
Generated: <timestamp> | Pulse: <pulseId> | Nodes: N | Edges: N

## Entry Points (top 5 by gravity)
- `api.py::get_user` [FastAPI route, gravity: 0.89, risk: 0.34]
- ...

## Structural Hotspots (top 5 by risk)
- `advisor.py::detectHubs` [risk: 0.82, complexity: 24, churn: 18 commits/14d]
  Why: high complexity + high churn + 4 authors
- ...

## Active Violations (all)
- CYCLE: a.py → b.py → c.py → a.py [detected: <date>]
- ...

## Architectural Lies (top 5 co-change pairs)
- `billing.py` ↔ `auth.py` [NCoChange: 0.87, no structural edge]
- ...

## Architectural Layers (Kahn levels)
- Layer 0 (surface): api.py, cli.py [N symbols]
- Layer 3 (core): db.py, models.py [N symbols]
- ...

## Framework
- Detected: FastAPI | External deps: 12 (2 unpinned)
```

- [x] Add `conducks context-gen` CLI command
- [x] Pull prioritized data from DuckDB
- [x] Hard cap output at 4000 tokens for LLM context
- [x] Priority order: entry points → hotspots → violations → lies → layers → framework
- [x] Regenerate `ARCHITECTURE.md` automatically after pulse
- [x] Add `conducks_system(mode:'architecture-context')` MCP parameter
- [x] **Test:** verified context size and priority
- [x] **Test:** verified automatic regeneration

### ✅ 5.9 — Upgrade: Selective Fidelity Enforcement on all 8 MCP Tools
**Current state:** COMPLETED. All 8 tools enforce Rule 451 flat node shape, 10-item caps, and staleness signals.
**Gap:** No standardized response format. Agents may get overwhelmed on large repos.
**Files to change:** `lib/product/mcp/tools/synapse.ts`, `lib/product/mcp/tools/kinetic.ts`

**Rules to enforce across ALL 8 tools:**
1. All list results: max 10 items, ranked by relevance/risk
2. All node objects in lists: flat structure `{id, kind, file, name, risk, gravity}`
3. All responses: under 8KB total
4. All responses: include `truncated: boolean` and `totalCount: number`
5. `conducks_metrics(mode:'explain')` is the ONLY exception — returns full detail for ONE symbol
6. No nested objects more than 2 levels deep in any response

**Standard node object shape (all tools):**
```typescript
{
  id: string,
  kind: string,
  file: string,
  name: string,
  risk: number,        // 0-1
  gravity: number,     // 0-1 PageRank
  summary: string      // one-line human description
}
```

- [ ] Audit current response size of all 8 MCP tools on orchestrator (9230 nodes)
- [ ] Add `truncateResults(items, limit=10)` utility to MCP server
- [ ] Add `truncated` and `totalCount` fields to all list responses
- [ ] Enforce flat node object shape across all tools
- [ ] Add `include_detail: boolean` parameter to `conducks_metrics` (default false)
- [ ] When `include_detail: false` (default): return tiny objects
- [ ] When `include_detail: true` with symbol ID: return full 6-signal decomposition
- [ ] **Test:** call all 8 tools on orchestrator — verify no response exceeds 8KB
- [ ] **Test:** `conducks_metrics(symbol:'X', include_detail:true)` returns full decomposition
- [ ] **Test:** `conducks_metrics(mode:'hotspots')` returns max 10 tiny objects

### Phase 5 Gate — All Tests Required Before Phase 6

Before starting Phase 6, run:
```bash
npm run build && npm test -- --runInBand
```
All existing tests must pass.

Additionally verify manually:
- [ ] `conducks analyze orchestrator` completes in under 15 seconds
- [ ] `conducks entry` returns meaningful symbols (no local variables)
- [ ] `conducks status` shows framework and staleness info
- [ ] `conducks context-gen` produces under 4000 token `ARCHITECTURE.md`
- [ ] All 8 MCP tool responses under 8KB on orchestrator
- [ ] `conducks watch` shows live blast radius on file save
- [ ] MCP Resources browseable without tool calls

---

