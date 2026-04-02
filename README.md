# 🏺 CONDUCKS — Structural Intelligence & Governance

**Conducks** is a high-fidelity, Git-native architectural observation platform. It transforms your source code into a living **Synapse Graph**, enabling real-time structural audits, behavioral tracing, and automated governance.

---

## 🧬 Interface Spectrum (CLI & MCP)
Conducks is a unified structural engine designed for both **Human Developers** and **AI Agents**. By sharing a common Synapse Graph, it ensures that your code standards are maintained regardless of who is modifying the project.

- **💻 Terminal CLI**: Optimized for developer experience with rich terminal output, interactive dashboards, and rapid architectural feedback.
- **🤖 MCP Server**: A high-fidelity Model Context Protocol interface that allows AI Agents (like Antigravity) to perform deep-dives, trace execution, and verify structural integrity before proposing changes.

---

## 🚀 Key Features

### 🌊 The Kinetic Suite (Structural Pulse)
- **`analyze`**: Full structural reflection of the codebase into a Synapse Graph.
- **`status`**: High-level structural health check (Node/Edge density).
- **`list`**: Paginated listing of all identified symbols.
- **`setup`**: Automated environment and vault initialization.

### 🔍 Structural Intelligence
- **`query`**: Topological search across the synapse using pattern matching.
- **`explain`**: Deep-dive risk-scoring for any symbol (Risk vs Gravity).
- **`impact`**: Recursive "Blast Radius" calculation for proposed changes.
- **`trace`**: Step-by-step execution flow visualization.
- **`flows`**: Discovery of behavioral circuits and handler patterns.

### 🛡️ Core Governance
- **`audit`**: Structural policy verification against the Sentinel laws.
- **`advise`**: AI-less architectural consultant for refactoring paths.
- **`blueprint`**: Generation of high-fidelity architectural manifests.
- **`entry`**: Automated identification of system entry points (Routes, Handlers).

### 🧬 Optimization & Physics
- **`resonance`**: Cross-project structural similarity comparison.
- **`entropy`**: Analysis of authorship fragmentation and cognitive load.
- **`cohesion`**: Calculation of logical binding strength between components.
- **`prune`**: Automated discovery of orphaned symbols and dead-weight code.

### 🔄 Refactoring & Evolution
- **`rename`**: Graph-verified atomic renaming across the entire codebase.
- **`diff`**: Architectural regression detection (Historical vs Working Tree).
- **`record`**: Structural snapshot versioning for long-term health tracking.
- **`watch`**: Real-time background indexing of file changes.

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/gospel-of-technology/conducks.git
cd conducks

# Install dependencies and Build
npm install
npm run build

# Link the binary (Optional)
npm link
```

## 🔧 Usage & Workflows

### 🧬 1. Initialize the Structural Synapse
First, calibrate the environment and perform the initial reflection of your project.
```bash
conducks setup           # Anchor the vault
conducks analyze full    # Reflect structure (Saves to .conducks/conducks-synapse.db)
conducks status          # Verify node/edge density
```

### 🛡️ 2. Architectural Guardrails (Audit)
Verify that your codebase isn't drifting from the intended design laws.
```bash
conducks audit           # Detect sentinel violations
conducks advise          # Get AI-less structural recommendations
```

### 🔍 3. Symbol Discovery & Impact
Understand the risk and centrality of any symbol before modifying it.
```bash
conducks query "Persistence" # Find symbols by name/pattern
conducks explain "Persistence::load" # Risk score (Risk / 10.0)
conducks impact "Persistence::save" --direction upstream # Find callers
```

### 🛡️ Sentinel Governance (`sentinel.json`)

**Sentinel** is the core architectural enforcement engine of Conducks. It allows you to define and enforce structural "Laws" (MVC, Onion, Clean Architecture, etc.) to prevent architectural drift.

#### 🐚 Zero-Intrusive & Discovery-First
Conducks is designed to be **Zero-Intrusive** and works with your existing code exactly as it is.
- **Automatic Discovery**: Conducks discovers structural data automatically across your codebase. There are **no source code additives, keywords, or decorators** needed.
- **Opt-in Governance**: Sentinel is a purely **optional** layer. If you don't have a `sentinel.json`, Conducks remains a pure intelligence and observation platform (Mirror, Impact, Trace).
- **Specialized Hardening**: You only use Sentinel when you want to "Harden" your architecture. You can build these rules manually or have an **AI Agent** generate a technical manifest to enforce your specific standards.

#### ⚙️ Quick Setup
1. **Create the file**: Place a `config/sentinel.json` file in your project root.
2. **Define rules**: Add rule objects to the JSON array (see catalog below).
3. **Audit**: Run `conducks audit` to verify compliance.

#### 📜 Rule Catalog & Format
The `sentinel.json` file is a JSON array of `SentinelRule` objects.

```json
[
  {
    "id": "ui-layer-isolation",
    "type": "require_caller",
    "matchPath": "src/services",
    "target": "DomainOrchestrator"
  }
]
```

| Type | Description | Use Case |
| :--- | :--- | :--- |
| `require_heritage` | Ensures a class implements an interface or extends a base. | Enforcing `BaseService` or `IController`. |
| `max_fans` | Limits the number of incoming dependencies (Fan-In). | **God Object Prevention**. |
| `require_caller` | Ensures a function is ONLY called by a specific parent. | Enforcing **Layer Isolation**. |
| `require_export` | Ensures a specific symbol is exported. | Enforcing Public APIs. |
| `require_file` | Ensures a specific file exists (e.g., `.conducksignore`). | Enforcing Documentation Standards. |
| `framework_check` | Ensures a class has a specific framework marker. | Verifying technology stack compliance. |

#### 🛡️ Example: Protecting an MVC Architecture
To ensure all Controllers in `/src/controllers` extend a `BaseController`:
```json
{
  "id": "mvc-controller-law",
  "type": "require_heritage",
  "matchPath": "src/controllers",
  "matchLabel": "class",
  "target": "BaseController"
}
```

---

### 🪞 Structural Mirror (Visualization)
The **Conducks Mirror** is a high-fidelity visual exploration dashboard that provides a real-time graphical representation of your codebase.

- **Command**: `conducks mirror`
- **Dashboard**: `http://localhost:3333`

#### 🔮 Key Visual Intelligence:
- **Kinetic Gravity Mapping**: Nodes are dynamically sized and colored based on their architectural importance (centrality).
- **Behavioral Clustering**: Automatically identifies and groups related logic into visual clusters.
- **Semantic Zoom**: Seamlessly navigate from high-level system modules down to granular function-level dependencies.
- **Live Pulse**: Integrates with the file watcher to reflect structural changes in the graph instantly.

---

## 💎 Advanced Intelligence (Physics of Code)
Conducks uses a custom structural physics model to quantify technical debt and risk:

- **Kinetic Energy ($E_k$ )**: Measures the temporal activity and volatility of a symbol based on change frequency and resonance.
- **Structural Gravity ($G$ )**: Calculated via PageRank. High-gravity symbols are critical hubs; if they fail, the system fails.
- **Architectural Entropy ($S$ )**: Measures the fragmentation of logic. High entropy indicates a symbol that is being touched by too many people for too many reasons.

## 🏺 The Synapse Persistence (DuckDB)
As of v1.0, Conducks uses **DuckDB** for vectorized structural analysis. This allows for sub-millisecond graph traversal across projects with millions of nodes while maintaining zero-effort project portability.

---
© 2026 Gospel of Technology. Structural Resonance Confirmed.
