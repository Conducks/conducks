# 🏺 CONDUCKS — Structural Intelligence Repository

**Conducks** is a high-fidelity, Git-native architectural observation platform designed to transform raw source code into a living **Synapse Graph**. Built as a part of the *Gospel of Technology*, it surpasses standard static analysis by modeling the **Kinetic Energy** and **Behavioral Flows** of a codebase.

---

## 🏛️ The Kinetic Suite (Core Features)

### 🌊 Structural Pulse (`analyze`)
The foundational phase where the physical project is reflected into the Synapse Graph.
*   **Chronicle Discovery**: Uses Git Object Model mirroring to find staged/untracked files instantly.
*   **High-Speed Batch Extraction**: Uses `cat-file --batch` for 5x faster indexing than standard tools.
*   **Multi-Lens Spectrum**: Built-in support for 7+ languages (TypeScript, Python, Go, Ruby, etc.) via Tree-sitter.

### 🔍 Structural Search (`query`)
Beyond simple grep, Conducks searches the topological relationships.
*   **GQL (Graph Query Language)**: Cypher-like pattern matching (e.g., `"(A)-[:CALLS]->(B)"`).
*   **Wavefront Resonance**: Fuzzy/Exact search weighted by **Kinetic Gravity** (importance).

### 🧬 Circuit Tracing (`context`)
Visualize the actual execution path of a symbol.
*   **Kinetic Flow Trace**: Step-by-step downstream call-graph traversal.
*   **Cerebral Circuit**: Identifies every function and variable participating in a specific behavioral flow.

### ☢️ Impact Analysis (`impact`)
Calculate the "Blast Radius" of a proposed change.
*   **Recursive Upstream Traversal**: Finds every direct and indirect caller that will break if a symbol is modified.
*   **Risk Scoring**: Categorizes changes as LOW, MEDIUM, HIGH, or CRITICAL based on structural entropy.

---

## 💎 The Conducks's Intelligence (Deep Analysis)

### 🏺 Conducks: The Kinetic Synapse
Conducks has evolved into a high-performance structural intelligence platform. By transitioning from JSON to **DuckDB**, we now support sub-millisecond analytical queries across millions of symbols.

- **Storage**: Vectorized DuckDB for massive scale.
- **Algorithms**: A* Kinetic Pathfinding for structural impact analysis.
- **Governance**: Sentinel-enforced policy validation.
- **Visual**: High-fidelity Mirror Dashboard for real-time synapse exploration.

### 🎓 Conducks Architecture Advisor (`advise`)
A cost-free, AI-less structural auditor that identifies "Architectural Sins."
*   **Circular Dependency Detection**: [FATAL] Identifies recursive import/call loops (A -> B -> A).
*   **Monolithic Hubs**: Flags symbols that are "too coupled" (Monolithic Hubs) relative to the median density.
*   **The Conducks's Intuition**: Infers relationships by matching string literals to symbol names (Inference).

### 📡 Project Resonance (`resonance`)
Compare the structural "Soul" of two different repositories.
*   **Structural Fingerprinting**: Calculates a signature based on density, kinetic energy, and typology.
*   **Similarity Score**: Returns a 0-100% resonance rating between two foundation projects.

### ✂️ Dead Weight Pruning (`prune`)
Identifies structural waste for manual or automated cleanup.
*   **Orphaned Symbols**: Declarations never referenced locally or globally.
*   **Unused Exports**: Symbols exported but never imported by any other file.
*   **Stale Imports**: Imports declared at the top of a file but never called.
*   **Unused Local Variables**: Logic assigned but never read.

---

## 🛠️ Safe Evolution (Refactoring & Regressions)

### 🔄 Graph-Verified Refactoring (`rename`)
Atomic, multi-file symbol renaming with 100% confidence.
*   **GVR Engine**: Verifies every single call site in the graph before making a single disk change.
*   **Automatic Rollback**: Reverts all changes if a single file write fails.

### 📉 Structural Diff (`diff`)
Detect architectural regressions before they are committed.
*   **Snapshotted State**: Compares the live graph against the base branch graph.
*   **Regressions**: Alerts you if a new commit adds a circular dependency or breaks a "Sentinel" rule.

---

## 🛡️ Governance & Manifest

### 🏺 Conducksic Blueprint (`blueprint`)
Generates a high-fidelity structural manifest (**`BLUEPRINT.md`**) of every node and relationship in the synapse.

### 🛡️ Sentinel Verification (`verify`)
Enforces custom architectural rules (e.g., "No database calls in the UI layer") using the Synapse graph.

---

## 📖 Architecture Glossary
*   **Synapse**: The central Graph Orchestration Engine.
*   **Prism**: The reflection layer that transforms code into metadata.
*   **Lens**: Language-specific parsers (TypeScript, Python, etc.).
*   **Chronicle**: Git-native file discovery layer.
*   **Kinetic Energy**: A metric of how "active" or "important" a node is in the graph.
*   **Conducks**: High-level analysis engines (Advisor, Resonance, Prune).

## 🏺 The Synapse Persistence (SBP)
As of v0.8.0, Conducks uses **Synapse Binary Prism (SBP)** powered by DuckDB. 

### Why DuckDB?
1. **Analytical Throughput**: Vectorized execution allows for instant "Kinetic Gravity" calculations over 100k+ nodes.
2. **Framework Coverage**: Enables ecosystem-wide aggregation of framework usage (Sentinel Framework Check) across federated projects.
3. **Scale**: Reduces 100MB+ JSON bloat to optimized binary storage.
4. **Graph Queries**: Native SQL/PGQ support for complex structural pattern matching.

### Neural Binding & A* Search
- **Universal Workspace Resolver**: Correctly stitches relative imports across multi-package projects (monorepos).
- **A* Traversal**: Uses structural heuristics ($h(n)$) to find the most critical architectural paths.
