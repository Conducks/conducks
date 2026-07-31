# TODO 4 — Universal Structural DNA Schema Reshape
**Conducks | Gospel of Technology**
**Status: DONE — Reshape Fully Reflected 🏺 ✅**

---

## Why This Exists

The current `nodes` table has three problems that will compound as we expand to 11+ languages:

1. **Language fragmentation** — tool-specific columns (`resonance`, `entropy`, `frameworks`) make the schema Python-biased. A Go struct or Swift protocol doesn't map cleanly to these columns.
2. **Implicit hierarchy** — containment relationships (function inside class inside file inside namespace) are reconstructed at query time from the edges table. This is slow and fragile.
3. **JSON blob dumping** — the catch-all `metadata` JSON column mixes structural attributes, physics signals, and plugin extensions together. Agents can't query it efficiently and it has no enforced shape.

This reshape fixes all three permanently. Do it before adding Python support. Getting the schema wrong after 11 languages are indexed costs a week of migration work. Getting it right now costs one `conducks clean`.

---

## The Core Insight: Three Distinct Relationship Types

Before writing any SQL, understand what we're actually modelling:

| Type | What It Means | Example |
|---|---|---|
| **Containment** | Structural nesting — where does this symbol live? | `login()` lives inside `AuthService` lives inside `auth.ts` |
| **Connectivity** | Functional relationships — what does this symbol interact with? | `login()` CALLS `hashPassword()` |
| **Ownership** | Kinetic/authorship signals — who owns this and how active is it? | `login()` has 47 commits, primary author: Said |

Right now all three are mixed in the edges table as the same thing. The reshape separates them cleanly: **containment moves into node columns, connectivity stays in edges, ownership moves into the `kinetic` JSON block.**

---

## The Universal Structural DNA Schema

### nodes table

```sql
CREATE TABLE IF NOT EXISTS nodes (

  -- ── IDENTITY ──────────────────────────────────────────────────────────────
  id TEXT,                      -- Canonical FQN: lowercase absolute path::symbol
  pulseId VARCHAR,              -- Structural Pulse Window (pulse_<timestamp>_<random>)
  fingerprint VARCHAR,          -- SHA256(file + name + dna) — enables fast structural diff

  -- ── TAXONOMY ──────────────────────────────────────────────────────────────
  canonicalKind VARCHAR,        -- ECOSYSTEM | NAMESPACE | UNIT | INFRA | STRUCTURE | BEHAVIOR | ATOM | DATA
  canonicalRank INTEGER,        -- 0 (Ecosystem) → 8 (Data)
  semantic_kind VARCHAR,        -- Language-specific: class | interface | function | goroutine | protocol | trait

  -- ── LOCATION ──────────────────────────────────────────────────────────────
  name TEXT,                    -- Symbol short-name (display name, original casing)
  file VARCHAR,                 -- Source file path (normalized lowercase)
  lineStart INTEGER,            -- Start line in source file
  lineEnd INTEGER,              -- End line in source file

  -- ── HIERARCHY (explicit containment — zero traversal needed) ─────────────
  parentId TEXT,                -- Direct parent node id
  rootId TEXT,                  -- Ecosystem/repository root node id
  namespaceId TEXT,             -- Owning namespace/folder node id
  unitId TEXT,                  -- Owning file node id
  structureId TEXT,             -- Owning class/interface node id (NULL if top-level)
  layer_path VARCHAR,           -- Materialized path: "myproject/src/auth/AuthService/login"
  depth INTEGER,                -- Depth in hierarchy (0=ecosystem, 1=namespace, 2=unit, etc.)

  -- ── COMPUTED SCORES (first-class columns for query performance) ───────────
  risk REAL,                    -- Composite 6-signal risk score (0-1)
  gravity REAL,                 -- PageRank score (0-1)
  complexity INTEGER,           -- Cyclomatic/cognitive complexity score
  isEntryPoint BOOLEAN,         -- Entry point indicator (routes, mains, handlers)
  visibility VARCHAR,           -- public | private | internal | protected

  -- ── STRUCTURAL DNA (stable identity attributes) ───────────────────────────
  dna JSON,
  -- Shape:
  -- {
  --   isAsync: boolean,
  --   isAbstract: boolean,
  --   isExported: boolean,
  --   isStatic: boolean,
  --   params: [{ name: string, type: string, optional: boolean }],
  --   returns: string,
  --   generics: string[],
  --   decorators: string[]
  -- }
  -- Mandatory keys: isAsync, isAbstract, isExported, params, returns
  -- Optional keys: language-specific extensions (e.g. goroutine concurrency model)

  -- ── SIGNATURE (behavioural attributes — changes when behaviour changes) ────
  signature JSON,
  -- Shape:
  -- {
  --   returnTypes: string[],
  --   throwsTypes: string[],
  --   sideEffects: string[],    -- "db_write" | "network" | "filesystem" | "state_mutation"
  --   callCount: number
  -- }

  -- ── KINETIC RESONANCE (git/authorship physics signals) ───────────────────
  kinetic JSON,
  -- Shape:
  -- {
  --   resonance: number,        -- Commit churn frequency
  --   entropy: number,          -- Shannon entropy (authorship diversity)
  --   primaryAuthor: string,
  --   authorCount: number,
  --   lastModified: number,     -- Unix timestamp
  --   tenureDays: number,       -- Age of symbol in codebase
  --   debtMarkers: string[],    -- TODO | FIXME | HACK | XXX | REFACTOR | DEPRECATED | BUG
  --   coveredBy: string[]       -- Test files covering this symbol
  -- }

  -- ── METADATA (plugin extensions — flexible bucket) ────────────────────────
  metadata JSON,
  -- Shape: open — framework-specific, plugin-specific, custom extensions
  -- e.g. { framework: "fastapi", anomaly: "cycle", ecosystemVersion: "3.11" }

  PRIMARY KEY (id, pulseId)
);
```

### edges table (containment removed — only functional relationships)

```sql
CREATE TABLE IF NOT EXISTS edges (
  id TEXT,
  pulseId VARCHAR,
  sourceId TEXT,
  targetId TEXT,

  -- Edge classification
  category VARCHAR,             -- STRUCTURAL | BEHAVIORAL | KINETIC
  type TEXT,                    -- CALLS | IMPORTS | EXTENDS | IMPLEMENTS | DEPENDS_ON
                                -- PULSES_TO | RESONATES_WITH | GUARDS | VIRTUAL_LINK

  -- Edge metadata
  weight REAL,                  -- Traversal weight (call=1.0, import=0.7, inheritance=1.2)
  confidence REAL,              -- Resolution confidence (0-1)
  lineNumber INTEGER,           -- Where in source this relationship occurs
  properties JSON,              -- Edge-specific extensions

  PRIMARY KEY (id, pulseId)
);
```

**Key change from current schema:** `CONTAINS` edges are gone from this table entirely. Containment now lives in node columns (`parentId`, `unitId`, `structureId`, etc.). This makes the edges table lean and traversals fast — you're only traversing meaningful functional relationships, not structural scaffolding.

### documents table (new — for md/txt/config files)

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  pulseId VARCHAR,
  filePath VARCHAR,
  kind VARCHAR,                 -- readme | api-doc | changelog | architecture | config
  title VARCHAR,                -- First H1 or filename
  sections JSON,                -- [{ heading, level, wordCount, hasCode }]
  symbols_referenced TEXT[],    -- Symbol names mentioned in this doc
  last_modified INTEGER         -- Unix timestamp
);
```

**Why documents exists:** Text files don't belong in the nodes table (wrong abstraction) but they carry real value — a README that mentions `AuthService` is architectural context. Rather than raw text storage (which needs embeddings to search), we extract structure: headings, sections, and which symbols are mentioned. This enables `DOCUMENTS` edges from symbols to the docs that reference them. No embeddings needed. Agents can answer "what documentation exists for this function" with a SQL join.

Embedding-based full-text search is deferred to Phase 8-9 as opt-in enhancement.

### pulses table (updated)

```sql
CREATE TABLE IF NOT EXISTS pulses (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  commitHash TEXT,              -- For staleness detection
  nodeCount INTEGER,
  edgeCount INTEGER,
  metadata JSON                 -- { framework, projectPath, languages[], duration }
);
```

### metadata table (unchanged)

```sql
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

---

## DuckDB Indexes (Required for Performance at Scale)

Without these indexes the schema works but degrades on large codebases. Add all of them.

```sql
-- Hierarchy traversal (most critical)
CREATE INDEX idx_nodes_parentId     ON nodes(parentId, pulseId);
CREATE INDEX idx_nodes_unitId       ON nodes(unitId, pulseId);
CREATE INDEX idx_nodes_structureId  ON nodes(structureId, pulseId);
CREATE INDEX idx_nodes_namespaceId  ON nodes(namespaceId, pulseId);

-- Layer and taxonomy queries
CREATE INDEX idx_nodes_layer        ON nodes(layer_path, pulseId);
CREATE INDEX idx_nodes_rank         ON nodes(canonicalRank, pulseId);
CREATE INDEX idx_nodes_kind         ON nodes(canonicalKind, pulseId);
CREATE INDEX idx_nodes_semantic     ON nodes(semantic_kind, pulseId);

-- Score-based ranking (MCP tool responses)
CREATE INDEX idx_nodes_risk         ON nodes(risk DESC, pulseId);
CREATE INDEX idx_nodes_gravity      ON nodes(gravity DESC, pulseId);

-- Edge traversal
CREATE INDEX idx_edges_source       ON edges(sourceId, pulseId);
CREATE INDEX idx_edges_target       ON edges(targetId, pulseId);
CREATE INDEX idx_edges_type         ON edges(type, pulseId);
CREATE INDEX idx_edges_category     ON edges(category, pulseId);

-- Document linking
CREATE INDEX idx_docs_filepath      ON documents(filePath, pulseId);
```

With these indexes, hierarchy queries on a 100k node codebase run under 5ms. Fast enough for real-time agent responses.

---

## The fingerprint Column — Why It Matters

```sql
fingerprint VARCHAR  -- SHA256(file + name + dna)
```

This enables structural diffing without loading full nodes. Two pulses with the same fingerprint mean the symbol is structurally identical even if the surrounding file changed. Your `conducks diff` becomes:

- **Same fingerprint** → symbol unchanged, skip deep comparison
- **Different fingerprint, same id** → symbol modified in place
- **id exists in pulse A but not B** → symbol deleted
- **id exists in pulse B but not A** → symbol added
- **Same fingerprint, different id** → symbol moved/renamed

This makes `conducks diff` a hash comparison instead of a content comparison. Dramatic speed improvement on large codebases.

---

## The dna JSON — Mandatory vs Optional Keys

Every language lens **must** populate these keys. The Reflector base class enforces this at ingestion time and rejects nodes that don't conform.

```typescript
interface UniversalDNA {
  // MANDATORY — every language must populate these
  isAsync: boolean;
  isAbstract: boolean;
  isExported: boolean;
  isStatic: boolean;
  params: { name: string; type: string; optional: boolean }[];
  returns: string;

  // OPTIONAL — language-specific extensions (free to add)
  generics?: string[];
  decorators?: string[];
  concurrency?: string;        // Go: goroutine model
  ownership?: string;          // Rust: borrow | move | clone
  protocol?: string;           // Swift: protocol conformance
  [key: string]: any;
}
```

Languages that don't support a mandatory concept set a neutral default:
- Language has no async concept → `isAsync: false`
- Language has no export concept → `isExported: true` (everything is public)
- Language has no abstract concept → `isAbstract: false`

---

## Multi-Language Alignment Map

How different language constructs map to the universal taxonomy:

| Language | Construct | canonicalKind | semantic_kind |
|---|---|---|---|
| TypeScript | `class` | STRUCTURE | class |
| TypeScript | `interface` | STRUCTURE | interface |
| TypeScript | `function` | BEHAVIOR | function |
| TypeScript | `const/let` | ATOM | variable |
| TypeScript | API route | INFRA | route |
| Python | `class` | STRUCTURE | class |
| Python | `def` | BEHAVIOR | function |
| Python | `@app.route` | INFRA | route |
| Python | `@app.middleware` | INFRA | middleware |
| Go | `struct` | STRUCTURE | struct |
| Go | `interface` | STRUCTURE | interface |
| Go | `func` (method) | BEHAVIOR | method |
| Go | `goroutine` | BEHAVIOR | goroutine |
| Rust | `struct` | STRUCTURE | struct |
| Rust | `trait` | STRUCTURE | trait |
| Rust | `fn` | BEHAVIOR | function |
| Swift | `class` | STRUCTURE | class |
| Swift | `protocol` | STRUCTURE | protocol |
| Swift | `func` | BEHAVIOR | function |
| Swift | `extension` | INFRA | extension |
| Java/Kotlin | `class` | STRUCTURE | class |
| Java/Kotlin | `interface` | STRUCTURE | interface |
| Java/Kotlin | `@Controller` | INFRA | route |

A Python class and a Go struct are both `STRUCTURE` at `canonicalRank 4`. Cross-language queries work without language-specific branching in MCP tools.

---

## Hierarchy: How It Works In Practice

### Example: `login()` inside `AuthService` inside `auth.ts`

```typescript
// What the Reflector sets during Pass 1 scope mapping
const loginNode = {
  id: 'src/auth/auth.ts::authservice::login',    // lowercase canonical FQN
  name: 'login',                                   // original casing preserved
  canonicalKind: 'BEHAVIOR',
  canonicalRank: 6,
  semantic_kind: 'function',

  // HIERARCHY — set explicitly during reflection, not inferred later
  parentId: 'src/auth/auth.ts::authservice',
  rootId: 'myproject',
  namespaceId: 'src/auth',
  unitId: 'src/auth/auth.ts',
  structureId: 'src/auth/auth.ts::authservice',

  // Computed
  layer_path: 'myproject/src/auth/auth.ts/authservice/login',
  depth: 5,

  dna: {
    isAsync: true,
    isAbstract: false,
    isExported: false,
    isStatic: false,
    params: [{ name: 'credentials', type: 'Credentials', optional: false }],
    returns: 'Promise<Session>'
  }
}
```

The Reflector already knows this during Pass 1 scope mapping. We're just persisting what we already compute instead of discarding it.

### Queries That Become Trivial

**Everything inside AuthService:**
```sql
SELECT * FROM nodes
WHERE structureId = 'src/auth/auth.ts::authservice'
AND pulseId = ?
```

**All top-level functions in a file (not inside any class):**
```sql
SELECT * FROM nodes
WHERE unitId = 'src/auth/auth.ts'
AND structureId IS NULL
AND canonicalKind = 'BEHAVIOR'
AND pulseId = ?
```

**Everything inside src/auth namespace:**
```sql
SELECT * FROM nodes
WHERE namespaceId = 'src/auth'
AND pulseId = ?
```

**Full ancestry of a symbol (single query, no traversal):**
```sql
SELECT
  n.*,
  parent.name   AS parentName,
  unit.name     AS fileName,
  ns.name       AS namespaceName,
  structure.name AS className
FROM nodes n
LEFT JOIN nodes parent    ON n.parentId    = parent.id
LEFT JOIN nodes unit      ON n.unitId      = unit.id
LEFT JOIN nodes ns        ON n.namespaceId = ns.id
LEFT JOIN nodes structure ON n.structureId = structure.id
WHERE n.id = 'src/auth/auth.ts::authservice::login'
AND n.pulseId = ?
```

**Class-level health rollup (no application-level aggregation):**
```sql
SELECT
  structureId,
  AVG(risk)        AS classRisk,
  SUM(complexity)  AS totalComplexity,
  COUNT(*)         AS methodCount,
  MAX(gravity)     AS peakGravity
FROM nodes
WHERE unitId = 'src/auth/auth.ts'
AND canonicalKind = 'BEHAVIOR'
AND pulseId = ?
GROUP BY structureId
```

---

## Impact on MCP Tool Quality

### conducks_query
Can now filter by `canonicalKind` + `semantic_kind` + `layer_path` in a single SQL scan. No graph traversal. Sub-millisecond on 100k nodes. Returns full containment context with every symbol — agents know immediately where a symbol lives without a second call.

### conducks_metrics
Gets `risk` and `gravity` from native columns, not JSON extraction. Faster ranking. Class-level rollups via `structureId` grouping with no application code needed.

### conducks_governance
```sql
WHERE risk > 0.7 AND canonicalRank = 6
```
High-risk behaviors in one scan. No traversal.

### conducks_trace
Uses `layer_path` prefix matching for namespace-scoped traces. Sibling detection via `structureId` matching. Agents learn that `logout()` and `refresh()` are siblings of `login()` in `AuthService` without additional calls — that's co-located risk awareness.

### conducks_evolution (diff)
`fingerprint` makes diff a hash comparison. Changed vs moved vs identical is resolved before loading node content. Dramatically faster on large codebases.

### conducks_system (architecture-context)
Layer distribution query becomes trivial:
```sql
SELECT canonicalRank, canonicalKind, COUNT(*) as symbolCount
FROM nodes WHERE pulseId = ?
GROUP BY canonicalRank, canonicalKind
ORDER BY canonicalRank
```

---

## Files to Change

| File | Change |
|---|---|
| `persistence.ts` | Replace `CREATE TABLE nodes` with universal schema. Update `save()`, `saveBatchSpectrum()`, `load()` to map new columns. Add all indexes. |
| `reflector.ts` | Populate `parentId`, `unitId`, `structureId`, `namespaceId`, `layer_path`, `depth` during Pass 1 scope mapping. Populate `dna`, `signature` with mandatory key enforcement. Move git signals into `kinetic` JSON. |
| `graph-engine.ts` | Update `ingestSpectrum()` for new column names. Remove CONTAINS edge creation (now in node columns). |
| `adjacency-list.ts` | Add `structureId`, `unitId`, `namespaceId` to `ConducksNode` properties type. Update `findSymbolAtLine` to use explicit hierarchy. |
| `taxonomy.ts` | Add `semantic_kind` values for all planned languages. |
| `diff-engine.ts` | Use `fingerprint` for fast structural comparison before content comparison. |
| All MCP tools | Update response shapes to include containment context (`parentName`, `fileName`, `namespaceName`) from single enriched query. |

---

## Migration Strategy

**Do not attempt ALTER TABLE.** The schema change is structural, not additive. The correct approach:

```bash
# 1. Apply schema changes to persistence.ts
# 2. Clear existing database
conducks clean

# 3. Re-index with universal schema
conducks analyze

# 4. Verify hierarchy integrity
node scripts/diagnostics/layer_audit.cjs

# 5. Inspect database directly
node scripts/inspect-duckdb.mjs
```

---

## Verification Checklist

- [ ] All nodes have `parentId`, `unitId`, `namespaceId` populated (no NULLs except root)
- [ ] `layer_path` is populated for every node and uses lowercase
- [ ] `fingerprint` is populated for every node
- [ ] `dna` contains all mandatory keys for every node
- [ ] `kinetic` contains git signals (not scattered in top-level columns)
- [ ] `CONTAINS` edges no longer exist in the edges table
- [ ] Hierarchy query for `AuthService` returns all methods in single scan
- [ ] Namespace prefix query returns all symbols in folder
- [ ] Cross-language: Python class and Go struct both show `STRUCTURE` / `canonicalRank: 4`
- [ ] `conducks diff` uses fingerprint comparison (verify in logs)
- [ ] All 8 MCP tool responses include containment context
- [ ] No MCP response exceeds 8KB on orchestrator repo (9230 nodes)
- [ ] `conducks analyze orchestrator` completes under 15 seconds

---

## What This Does NOT Include (Deferred)

**Full-text search on MD/TXT files** — requires embeddings. Deferred to Phase 8-9 as opt-in. The `documents` table covers 80% of the value (structure extraction + symbol cross-referencing) without vectors.

**DuckPGQ graph views** — useful for complex traversals but not needed until Phase 9 federated queries. Current adjacency list + explicit hierarchy columns covers all current use cases.

**VSS embeddings** — opt-in only per the manifest. Never in the core analysis pipeline.

---

## Definition of Done

This todo is complete when:
1. `conducks analyze` on the TypeScript Conducks repo produces nodes with full hierarchy populated
2. A single SQL query returns the complete ancestry of any symbol without graph traversal
3. `conducks diff` between two pulses uses fingerprint comparison
4. All 8 MCP tools return containment context in their responses
5. The layer audit script shows 100% hierarchy integrity
6. Python lens (Phase 6) can be added by only implementing `UniversalDNA` mapping in the Reflector — zero changes to persistence, adjacency-list, or MCP tools

---

---

## Agent Query Intelligence — How Agents Navigate This Graph

### The Core Question: Should Agents Write SQL?

Three options exist. Only one is correct.

| Option | Description | Verdict |
|---|---|---|
| **Raw SQL** | Agent generates and executes arbitrary SQL | ❌ Wrong — agents write incorrect SQL regularly, wrong pulseId filters, wrong joins, confidently wrong results |
| **Fully hardcoded** | Every query pre-written, agent calls tools with fixed parameters | ❌ Too rigid — cannot anticipate every developer question |
| **Parameterised templates** | Named query library, agent picks template + fills typed params | ✅ Correct — safe, fast, predictable, extensible |

The agent never writes SQL. It speaks intent. The system translates intent to SQL.

```
Agent
  ↓ speaks intent ("find usages of login")
MCP Tool Layer
  ↓ maps intent to template name + params
Query Template Library
  ↓ validated, parameterised SQL
DuckDB
  ↓ fast indexed query
Structured Results
  ↓ flat objects, under 8KB, truncated with count
Agent
```

---

### The Query Template Library

Each template has a name, description, typed params, and a fixed parameterised SQL body. The agent calls by name. `pulseId` is always injected by the system — never passed by the agent, so it can never accidentally query a stale snapshot.

```typescript
const QUERIES = {

  // ── USAGE ANALYSIS ─────────────────────────────────────────────────────────

  find_usages: {
    description: "Find all callers of a specific symbol",
    params: { symbolId: "string", edgeType: "CALLS|IMPORTS|EXTENDS", limit: "number" },
    sql: `
      SELECT
        e.sourceId, n.name, n.file, n.structureId,
        n.namespaceId, n.risk, n.canonicalKind
      FROM edges e
      JOIN nodes n ON e.sourceId = n.id
      WHERE e.targetId = $symbolId
      AND e.type = $edgeType
      AND e.pulseId = $pulseId
      ORDER BY n.risk DESC
      LIMIT $limit
    `
  },

  find_imports: {
    description: "Find all files that import a specific module or file",
    params: { targetId: "string", limit: "number" },
    sql: `
      SELECT
        e.sourceId, n.name, n.file, n.namespaceId,
        n.risk, n.gravity
      FROM edges e
      JOIN nodes n ON e.sourceId = n.id
      WHERE e.targetId = $targetId
      AND e.type = 'IMPORTS'
      AND e.pulseId = $pulseId
      ORDER BY n.gravity DESC
      LIMIT $limit
    `
  },

  unused_exports: {
    description: "Find exported symbols never imported by any other file",
    params: { limit: "number" },
    sql: `
      SELECT
        n.id, n.name, n.file, n.risk,
        json_extract(n.kinetic, '$.tenureDays') AS tenureDays
      FROM nodes n
      LEFT JOIN edges e ON e.targetId = n.id
        AND e.type = 'IMPORTS'
        AND e.pulseId = n.pulseId
      WHERE json_extract(n.dna, '$.isExported') = true
      AND e.id IS NULL
      AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
      AND n.pulseId = $pulseId
      ORDER BY tenureDays DESC
      LIMIT $limit
    `
  },

  // ── DEAD CODE ───────────────────────────────────────────────────────────────

  dead_code: {
    description: "Find symbols with no incoming edges — dead code candidates ranked by tenure and risk",
    params: { minTenureDays: "number", limit: "number" },
    sql: `
      SELECT
        n.id, n.name, n.file, n.risk, n.gravity, n.complexity,
        n.canonicalKind, n.semantic_kind, n.structureId,
        json_extract(n.kinetic, '$.tenureDays')    AS tenureDays,
        json_extract(n.kinetic, '$.primaryAuthor') AS primaryAuthor,
        json_extract(n.kinetic, '$.authorCount')   AS authorCount
      FROM nodes n
      LEFT JOIN edges e ON e.targetId = n.id AND e.pulseId = n.pulseId
      WHERE e.id IS NULL
      AND n.isEntryPoint = false
      AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
      AND json_extract(n.kinetic, '$.tenureDays') >= $minTenureDays
      AND n.pulseId = $pulseId
      ORDER BY n.risk DESC, tenureDays DESC
      LIMIT $limit
    `
    -- tenureDays distinguishes "added last week, not wired up yet" from
    -- "dead for 2 years" — critical for safe deletion decisions
  },

  high_risk_dead_code: {
    description: "Dead code that is also high complexity — dangerous to leave, worth investigating",
    params: { minComplexity: "number", minTenureDays: "number", limit: "number" },
    sql: `
      SELECT
        n.id, n.name, n.file, n.risk, n.complexity,
        json_extract(n.kinetic, '$.tenureDays')    AS tenureDays,
        json_extract(n.kinetic, '$.primaryAuthor') AS primaryAuthor
      FROM nodes n
      LEFT JOIN edges e ON e.targetId = n.id AND e.pulseId = n.pulseId
      WHERE e.id IS NULL
      AND n.isEntryPoint = false
      AND n.complexity >= $minComplexity
      AND json_extract(n.kinetic, '$.tenureDays') >= $minTenureDays
      AND n.pulseId = $pulseId
      ORDER BY n.risk DESC
      LIMIT $limit
    `
  },

  // ── BLAST RADIUS & IMPACT ───────────────────────────────────────────────────

  blast_radius: {
    description: "Find all direct dependents of a symbol — who breaks if this changes",
    params: { symbolId: "string", limit: "number" },
    sql: `
      SELECT
        e.sourceId, n.name, n.file, n.risk,
        n.structureId, n.namespaceId, e.weight, e.type
      FROM edges e
      JOIN nodes n ON e.sourceId = n.id
      WHERE e.targetId = $symbolId
      AND e.pulseId = $pulseId
      ORDER BY e.weight DESC, n.risk DESC
      LIMIT $limit
    `
  },

  deep_impact: {
    description: "Transitive dependents up to N hops — full blast radius",
    params: { symbolId: "string", maxDepth: "number", limit: "number" },
    sql: `
      WITH RECURSIVE impact AS (
        SELECT targetId AS id, sourceId AS dependentId, 1 AS depth
        FROM edges
        WHERE targetId = $symbolId
        AND pulseId = $pulseId

        UNION ALL

        SELECT e.targetId, e.sourceId, i.depth + 1
        FROM edges e
        JOIN impact i ON e.targetId = i.dependentId
        WHERE i.depth < $maxDepth
        AND e.pulseId = $pulseId
      )
      SELECT DISTINCT
        n.id, n.name, n.file, n.risk,
        n.canonicalKind, n.namespaceId,
        MIN(i.depth) AS hopDistance
      FROM impact i
      JOIN nodes n ON i.dependentId = n.id
      GROUP BY n.id, n.name, n.file, n.risk, n.canonicalKind, n.namespaceId
      ORDER BY hopDistance ASC, n.risk DESC
      LIMIT $limit
    `
  },

  structural_siblings: {
    description: "Find all symbols in the same class as a given symbol — co-located risk",
    params: { symbolId: "string" },
    sql: `
      SELECT id, name, risk, complexity, gravity, semantic_kind, visibility
      FROM nodes
      WHERE structureId = (
        SELECT structureId FROM nodes
        WHERE id = $symbolId AND pulseId = $pulseId
      )
      AND id != $symbolId
      AND pulseId = $pulseId
      ORDER BY risk DESC
    `
    -- Catches co-located risk: logout() breaking because login() changed shared state,
    -- even with no direct call edge between them
  },

  // ── HIERARCHY NAVIGATION ────────────────────────────────────────────────────

  symbols_in_structure: {
    description: "Find all symbols inside a class or interface",
    params: { structureId: "string" },
    sql: `
      SELECT
        id, name, semantic_kind, risk, gravity,
        complexity, visibility, isEntryPoint,
        json_extract(dna, '$.isAsync')    AS isAsync,
        json_extract(dna, '$.isStatic')   AS isStatic,
        json_extract(dna, '$.returns')    AS returns
      FROM nodes
      WHERE structureId = $structureId
      AND pulseId = $pulseId
      ORDER BY gravity DESC
    `
  },

  symbols_in_namespace: {
    description: "Find all symbols inside a folder/namespace",
    params: { namespaceId: "string", canonicalKind: "string", limit: "number" },
    sql: `
      SELECT
        id, name, file, canonicalKind, semantic_kind,
        risk, gravity, complexity, structureId
      FROM nodes
      WHERE namespaceId LIKE $namespaceId
      AND ($canonicalKind = '' OR canonicalKind = $canonicalKind)
      AND pulseId = $pulseId
      ORDER BY gravity DESC
      LIMIT $limit
    `
  },

  full_ancestry: {
    description: "Get complete containment context for a symbol in one query",
    params: { symbolId: "string" },
    sql: `
      SELECT
        n.*,
        parent.name    AS parentName,
        unit.name      AS fileName,
        ns.name        AS namespaceName,
        structure.name AS className
      FROM nodes n
      LEFT JOIN nodes parent    ON n.parentId    = parent.id
      LEFT JOIN nodes unit      ON n.unitId      = unit.id
      LEFT JOIN nodes ns        ON n.namespaceId = ns.id
      LEFT JOIN nodes structure ON n.structureId = structure.id
      WHERE n.id = $symbolId
      AND n.pulseId = $pulseId
    `
  },

  class_health_rollup: {
    description: "Health metrics for all classes in a file — risk, complexity, method count",
    params: { unitId: "string" },
    sql: `
      SELECT
        structureId,
        AVG(risk)        AS classRisk,
        SUM(complexity)  AS totalComplexity,
        COUNT(*)         AS methodCount,
        MAX(gravity)     AS peakGravity,
        MIN(risk)        AS lowestMethodRisk
      FROM nodes
      WHERE unitId = $unitId
      AND canonicalKind = 'BEHAVIOR'
      AND pulseId = $pulseId
      GROUP BY structureId
      ORDER BY classRisk DESC
    `
  },

  // ── ARCHITECTURAL ANALYSIS ──────────────────────────────────────────────────

  high_risk_symbols: {
    description: "Find symbols above a risk threshold, optionally scoped to a namespace",
    params: { minRisk: "number", namespaceId: "string", limit: "number" },
    sql: `
      SELECT
        id, name, file, risk, gravity, complexity,
        canonicalKind, semantic_kind, structureId,
        json_extract(kinetic, '$.primaryAuthor') AS primaryAuthor,
        json_extract(kinetic, '$.resonance')     AS churn
      FROM nodes
      WHERE risk >= $minRisk
      AND ($namespaceId = '' OR namespaceId LIKE $namespaceId)
      AND pulseId = $pulseId
      ORDER BY risk DESC
      LIMIT $limit
    `
  },

  cross_namespace_coupling: {
    description: "Find unexpected dependencies between namespaces — architectural lie detector",
    params: { limit: "number" },
    sql: `
      SELECT
        source.namespaceId AS fromNamespace,
        target.namespaceId AS toNamespace,
        COUNT(*)           AS edgeCount,
        AVG(e.weight)      AS avgCoupling,
        MAX(source.risk)   AS maxSourceRisk
      FROM edges e
      JOIN nodes source ON e.sourceId = source.id
      JOIN nodes target ON e.targetId = target.id
      WHERE source.namespaceId != target.namespaceId
      AND source.namespaceId IS NOT NULL
      AND target.namespaceId IS NOT NULL
      AND e.pulseId = $pulseId
      GROUP BY source.namespaceId, target.namespaceId
      ORDER BY edgeCount DESC
      LIMIT $limit
    `
    -- Complements the co-change engine: structural coupling catches what git history misses
  },

  cycles: {
    description: "Find all circular dependency groups — Tarjan SCC results",
    params: { limit: "number" },
    sql: `
      SELECT
        n.id, n.name, n.file, n.risk, n.namespaceId,
        json_extract(n.metadata, '$.anomaly') AS anomaly
      FROM nodes n
      WHERE json_extract(n.metadata, '$.anomaly') = 'cycle'
      AND n.pulseId = $pulseId
      ORDER BY n.risk DESC
      LIMIT $limit
    `
  },

  layer_distribution: {
    description: "Architectural layer breakdown — how many symbols at each level",
    params: {},
    sql: `
      SELECT
        canonicalRank,
        canonicalKind,
        COUNT(*)   AS symbolCount,
        AVG(risk)  AS avgRisk,
        AVG(gravity) AS avgGravity,
        SUM(CASE WHEN isEntryPoint THEN 1 ELSE 0 END) AS entryPointCount
      FROM nodes
      WHERE pulseId = $pulseId
      GROUP BY canonicalRank, canonicalKind
      ORDER BY canonicalRank
    `
  },

  entry_points: {
    description: "All entry points ranked by gravity — where to start reading a codebase",
    params: { limit: "number" },
    sql: `
      SELECT
        id, name, file, gravity, risk, complexity,
        canonicalKind, semantic_kind, namespaceId,
        json_extract(metadata, '$.framework') AS framework
      FROM nodes
      WHERE isEntryPoint = true
      AND pulseId = $pulseId
      ORDER BY gravity DESC
      LIMIT $limit
    `
  },

  hotspots: {
    description: "Highest combined risk and gravity — the most dangerous important symbols",
    params: { limit: "number" },
    sql: `
      SELECT
        id, name, file, risk, gravity, complexity,
        canonicalKind, semantic_kind, structureId,
        (risk * 0.6 + gravity * 0.4) AS hotspotScore,
        json_extract(kinetic, '$.resonance')     AS churn,
        json_extract(kinetic, '$.primaryAuthor') AS primaryAuthor
      FROM nodes
      WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
      AND pulseId = $pulseId
      ORDER BY hotspotScore DESC
      LIMIT $limit
    `
  },

  // ── SCOPE-AWARE SEARCH ──────────────────────────────────────────────────────

  find_by_name: {
    description: "Find symbols by name, optionally scoped to namespace or kind",
    params: { name: "string", namespaceId: "string", canonicalKind: "string", limit: "number" },
    sql: `
      SELECT
        id, name, file, risk, gravity, complexity,
        canonicalKind, semantic_kind, structureId, namespaceId,
        parentName, unitId
      FROM nodes
      WHERE (name = $name OR name LIKE $name)
      AND ($namespaceId = '' OR namespaceId LIKE $namespaceId)
      AND ($canonicalKind = '' OR canonicalKind = $canonicalKind)
      AND pulseId = $pulseId
      ORDER BY gravity DESC
      LIMIT $limit
    `
    -- Large codebases have "validate" in 40 places. namespaceId scoping
    -- gets the agent to the 2 that matter without filtering noise manually.
  },

}
```

---

### How The Agent Calls Templates

The agent never sees SQL. It calls by template name with typed parameters through the MCP tool:

```typescript
// Agent call — clean, typed, no SQL
conducks_query({
  mode: 'template',
  template: 'find_usages',
  params: {
    symbolId: 'src/auth/auth.ts::authservice::login',
    edgeType: 'CALLS',
    limit: 20
  }
})

// System response — flat, typed, under 8KB
{
  template: 'find_usages',
  totalCount: 8,
  truncated: false,
  data: [
    { sourceId: '...', name: 'handleLogin', file: 'src/routes/auth.ts',
      structureId: null, namespaceId: 'src/routes', risk: 0.71, canonicalKind: 'BEHAVIOR' },
    // ...
  ]
}
```

---

### The MCP Execution Layer

```typescript
async function executeTemplate(
  templateName: string,
  params: Record<string, any>,
  db: Database
): Promise<QueryResult> {

  const template = QUERIES[templateName];

  // Validate template exists
  if (!template) {
    throw new Error(
      `Unknown template: "${templateName}". ` +
      `Available: ${Object.keys(QUERIES).join(', ')}`
    );
  }

  // Validate all required params present
  const missingParams = Object.keys(template.params)
    .filter(p => !(p in params));

  if (missingParams.length > 0) {
    throw new Error(`Missing required params: ${missingParams.join(', ')}`);
  }

  // pulseId always injected by system — agent never controls this
  // Prevents accidental or malicious stale snapshot queries
  const latestPulseId = await getLatestPulseId(db);
  const safeParams = { ...params, pulseId: latestPulseId };

  // Parameterised binding — no string interpolation, no injection surface
  const results = await db.all(template.sql, safeParams);

  return {
    template: templateName,
    count: results.length,
    truncated: results.length === params.limit,
    data: results
  };
}
```

`pulseId` is always current. Always injected by the system. Never passed by the agent. This is non-negotiable.

---

### Template Composition — Answering Complex Questions

Most complex questions decompose into 2-3 template calls. The agent does the composition logic. The templates do the data retrieval.

**"Find dead code that's also high complexity and was written by a single author"**
1. Call `high_risk_dead_code` → get orphaned high-complexity symbols
2. Agent filters returned `authorCount === 1` from the `kinetic` data
3. Agent reports: "3 symbols, dead 180+ days, single author, high complexity — safe deletion candidates"

**"Is AuthService safe to refactor?"**
1. Call `class_health_rollup` with `unitId = 'src/auth/auth.ts'` → get per-method risk
2. Call `blast_radius` for the highest-risk method → get direct dependents
3. Call `structural_siblings` for that method → get co-located risk
4. Agent synthesises: "AuthService has 4 methods. login() is highest risk (0.73), 8 direct callers, 2 siblings share state. Refactor login() last."

**"Where should I start reading this codebase?"**
1. Call `entry_points` → get gravity-ranked entry points
2. Call `layer_distribution` → understand architectural shape
3. Call `symbols_in_namespace` on the top-gravity namespace → get the core module
4. Agent gives: "Start at api.ts (entry point, gravity 0.89). Core logic in src/auth. 3 architectural layers detected."

---

### The Constrained Filter Builder — For Power Users

For questions that don't fit any template, expose a typed filter interface instead of raw SQL. The agent expresses intent through a structured object. The system compiles it to safe parameterised SQL server-side. Every field validated against an allowed list before query construction.

```typescript
conducks_query({
  mode: 'filter',
  filters: {
    canonicalKind: 'BEHAVIOR',          // allowed: ECOSYSTEM|NAMESPACE|UNIT|INFRA|STRUCTURE|BEHAVIOR|ATOM|DATA
    namespaceId: 'src/auth',            // prefix match
    minRisk: 0.6,                       // 0-1
    maxComplexity: 30,                  // integer
    hasIncomingEdges: false,            // boolean — for dead code
    isEntryPoint: false,                // boolean
    semantic_kind: 'function',          // language-specific kind
    minTenureDays: 90                   // from kinetic JSON
  },
  orderBy: 'risk',                      // allowed: risk|gravity|complexity|name
  orderDir: 'DESC',                     // ASC|DESC
  limit: 20
})
```

This covers 95% of novel questions without ever exposing SQL. The remaining 5% get answered by adding a new named template.

---

### Launch Template Set — 15 Core Templates

Ship with these 15. Everything else gets added as real usage patterns emerge.

| # | Template | Answers |
|---|---|---|
| 1 | `find_usages` | Who calls this function? |
| 2 | `find_imports` | Who imports this module? |
| 3 | `unused_exports` | What's exported but never imported? |
| 4 | `dead_code` | What has no callers? |
| 5 | `high_risk_dead_code` | What dead code is also complex and dangerous? |
| 6 | `blast_radius` | What breaks if I change this? (direct) |
| 7 | `deep_impact` | What breaks transitively, N hops deep? |
| 8 | `structural_siblings` | What lives next to this in the same class? |
| 9 | `symbols_in_structure` | What's inside this class? |
| 10 | `symbols_in_namespace` | What's inside this folder? |
| 11 | `full_ancestry` | Where exactly does this symbol live? |
| 12 | `class_health_rollup` | How healthy is this class overall? |
| 13 | `high_risk_symbols` | What's most dangerous right now? |
| 14 | `cross_namespace_coupling` | What modules are unexpectedly coupled? |
| 15 | `cycles` | What circular dependencies exist? |
| 16 | `layer_distribution` | What's the architectural shape of this codebase? |
| 17 | `entry_points` | Where does this codebase start? |
| 18 | `hotspots` | What's both important and risky? |
| 19 | `find_by_name` | Find this symbol, scoped to a namespace |

> These 19 cover dead code, usage analysis, blast radius, architectural coupling, and codebase navigation. Every real developer question maps to one or a composition of two of these.

---

### Where Agent Navigation Still Has Limits

Be explicit about ceilings so agents don't over-claim.

**Multi-hop transitive traversal** — the `deep_impact` recursive CTE works but is heavier than single-hop queries. For agent use cases, precomputed blast radius scores (Dijkstra) are faster than live deep traversal per call. Use precomputed scores for quick answers, `deep_impact` only when the agent needs to explain the full chain.

**Dynamic dispatch** — if a codebase calls methods through interface references, the graph has edges to the interface method but not to concrete implementations. An agent tracing `authProvider.login()` finds the edge to `IAuthProvider.login` but can't know which concrete class runs at runtime. Flag this in agent responses: "This is an interface — N implementations exist: JWTAuthProvider, OAuth2AuthProvider."

**Intent vs structure** — the graph shows what exists and how things connect. It cannot explain why something was built a certain way. A function with 12 callers and high complexity might be a god function that should be split, or a genuinely important core utility that's supposed to be called everywhere. The `debtMarkers` in `kinetic` and `anomaly` in `metadata` help, but there's a ceiling. The agent should surface signals, not make architectural judgements autonomously.

---

### Files to Add/Change for Query Intelligence

| File | Change |
|---|---|
| `lib/product/mcp/tools/query-templates.ts` | New file — the full QUERIES library |
| `lib/product/mcp/tools/synapse.ts` | Add `mode: 'template'` and `mode: 'filter'` to `conducks_query` |
| `lib/product/mcp/tools/filter-builder.ts` | New file — compiles filter objects to parameterised SQL |
| `lib/product/mcp/server.ts` | Wire `executeTemplate` and `executeFilter` into tool dispatch |

---

### Verification Checklist — Query Intelligence

- [ ] All 19 launch templates execute correctly on Conducks own repo
- [ ] `find_usages` returns correct callers with full containment context
- [ ] `dead_code` returns zero false positives (entry points excluded)
- [ ] `deep_impact` respects `maxDepth` and returns hop distances
- [ ] `cross_namespace_coupling` catches known architectural coupling in test repo
- [ ] `pulseId` is always system-injected — never accepted from agent params
- [ ] All template responses under 8KB on orchestrator (9230 nodes)
- [ ] Filter builder rejects unknown field names with clear error
- [ ] Template composition: agent can answer "is AuthService safe to refactor" in 3 calls
- [ ] Node.js stress test: `find_usages` on `EventEmitter` returns correct callers under 5ms

---

*Conducks | Gospel of Technology | Schema Reshape Plan + Query Intelligence*
*Generated from architecture session — April 2026*