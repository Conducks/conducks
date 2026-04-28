# Conducks — Domain Feature Map 💎

> **Living document.** Updated as each feature is verified during the system-level audit.
> Last updated: 2026-03-31 (Post-Stabilization Audit)

---

## Legend
| Symbol | Meaning |
|:---:|:---|
| ✅ | Verified — tested and working correctly |
| 🔧 | Fixed — bug found and resolved during audit |
| ⚠️ | Partial — works but with known limitation |
| ⏳ | Untested — not yet audited |

---

## 1. Analysis Domain
> The root of the "Cerebral Circuit". Handles the transformation of source code into structural intelligence.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Full Pulse** | Discovery + Reflection + Resonance + Persistence. | `conducks analyze` | ✅ | 3,179 nodes; Persistence race conditions fixed |
| **Impact Analysis** | Calculates "Blast Radius" (Upstream/Downstream). | `conducks impact` | 🔧 | Fixed NaN%; fixed direction default to downstream |
| **Incremental Sync** | Only reflects staged changes. | `conducks analyze --staged` | ✅ | Verified on Conducks (37 units) |

---

## 2. Intelligence Domain
> Search, Query, and Comparison engines for deep structural understanding.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Structural Search** | Fuzzy and Pattern-based symbol lookup. | `conducks query` | ✅ | Working |
| **Cross-Proj Resonance** | Compare two repositories for structural similarity. | `conducks resonance` | ✅ | Verified on Conducks; Fixed NaN fmt and path normalization |
| **GQL Parser** | Structural Query Language (internal to MCP). | `registry.intelligence.gql` | ⏳ | Internal only |
| **Diff Engine** | Structural diff between the graph and working tree. | `conducks diff` | 🔧 | Fixed: corrected range property access and path normalization |

---

## 3. Evolution Domain
> Management of structural drift and atomic refactoring.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **GVR (Rename)** | Graph-Verified Refactoring. Dry-run by default. | `conducks rename` | 🔧 | Fixed: now traverses IMPORTS edges + defaults to `--dry-run`; use `--confirm` to apply |
| **Prune / Dead Code** | Orphan symbol detection. | `conducks prune` | ✅ | Working; note: `import type` symbols show as false-positive orphans |
| **Watcher** | Real-time FS monitoring and graph auto-sync. | `conducks watch` | ✅ | 100% Stabilized: Fixed Circular Dep, Persistence deadlocks, and macOS path casing |

---

## 4. Kinetic Domain
> Observation of data flow and execution processes.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Flow Tracing** | Trace execution/data path through the graph. | `conducks trace` | ✅ | 100% resolved — cross-module |
| **Process Grouping** | Group symbols into logical execution units. | `conducks flows` | ✅ | Working |

---

## 5. Metrics Domain
> Quantitative risk signals and technical debt measurement.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Risk Explain** | Decomposes the 6-signal composite risk score. | `conducks explain` | ✅ | Working |
| **Entropy** | Shannon entropy (author distribution diversity). | `conducks entropy` | 🔧 | Fixed NaN fmt; values populate from git history |
| **Cohesion** | Structural similarity between two neighborhoods. | `conducks cohesion` | 🔧 | Fixed NaN fmt |
| **Prune** | Dead code detection (orphan symbols). | `conducks prune` | ✅ | Working |

---

## 6. Governance Domain
> Policy enforcement and architectural integrity.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Sentinel Audit** | ARCH-3 Circularity and God Object detection. | `conducks verify` | ✅ | Working |
| **Structural Advisor** | Recommendations for refactoring and cleanup. | `conducks advise` | ✅ | Working |
| **Architecture-Context** | Generate LLM-optimized ARCHITECTURE.md. | `conducks context-gen` | ✅ | Working |
| **System Status** | Health and staleness checking. | `conducks status` | ✅ | Working |

---

## 7. Manifest / Docs Domain
> Documentation generation, memory, and AI-native context management.

| Feature | Description | Access | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Bootstrap Docs** | Generate project documentation scaffold. | `conducks bootstrap-docs` | ✅ | Verified |
| **Mirror** | Sync structural docs to external targets. | `conducks mirror` | ✅ | Verified; Dashboard LIVE at :3333 |
| **Context Gen** | Generate ARCHITECTURE.md from graph. | `conducks context-gen` | ✅ | Working |

---

## Known Gaps & Outstanding Items

| Item | Priority | Description |
| :--- | :--- | :--- |
| `import type` invisible to GVR blast radius | High | GVR now finds symbol-name-matched nodes but cross-file type-only refs still need graph edge support |
| `0.00%` on gravity/churn/entropy in `impact` | Low | Values populate from git history — need `conducks analyze --force` after commits |
| `prune` false positives for CLI command exports | Low | `import type` produces no runtime edges; CLI commands report as orphan exports — expected behavior |
| `import type` invisible to GVR blast radius | High | GVR now finds symbol-name-matched nodes but cross-file type-only refs still need graph edge support |
| `0.00%` on gravity/churn/entropy in `impact` | Low | Values populate from git history — need `conducks analyze --force` after commits |
| `prune` false positives for CLI command exports | Low | `import type` produces no runtime edges; CLI commands report as orphan exports — expected behavior |
