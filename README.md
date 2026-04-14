<!-- @format -->

# 🏺 Conducks

> **The 9-Layer Architectural Intelligence Map for your codebase. No embeddings, no guessing.**

Conducks parses your source code with Tree-sitter and its evolution-grade **Gnosis Resilience Engine**, extracting every symbol from the **Ecosystem** down to the **Data** layer. It stores everything in a local DuckDB structural vault that stays in sync with your repo. Any AI agent or developer can then ask precise questions about your codebase and get exact, graph-verified answers.

---

## What problem does it solve?

AI coding assistants typically use vector embeddings to find relevant code. That works fine for general snippets, but it breaks down when you need **Architectural Fidelity**: wrong file returned, symbol doesn't exist, or deep call-chains are missed.

Conducks replaces that fuzzy search with a deterministic structural graph built from your actual AST. By using the **Gnosis Resilience Bridge**, Conducks extracts semantic behavior (CALLS, IMPORTS) even in unstable environments where native parsers might fail. Think of it as giving your AI agent a high-resolution orbital map of your system instead of a rough sketch.

```
Without Conducks:  "I think getUserById is somewhere in services..."
With Conducks:     getUserById at src/services/user.ts line 42, called by 7 places, risk score 0.31
```

---

## Who is it for?

| User                                      | How they use it                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| **AI agents** (Claude, Antigravity, etc.) | Query symbols, trace call paths, detect regressions via MCP            |
| **Developers**                            | Explore and understand unfamiliar codebases without reading every file |
| **Teams**                                 | Enforce architectural rules before merging PRs                         |

---

## Getting started

### Prerequisites

- Node.js 18 or higher
- Git

### 1. Clone and build

```bash
git clone https://github.com/conducks/conducks
cd conducks
npm install && npm run build
npm link
```

After `npm link`, the `conducks` command is available globally. The built entry point is at `build/src/interfaces/cli/index.js` inside the repo folder — you'll need that path for the MCP config below.

### 2. Index your project

Go into the project you want to analyze and run:

```bash
cd /path/to/your/project
conducks setup
conducks analyze
```

This creates a `.conducks/` folder with the structural graph. From here you can use the CLI directly or connect it to an AI agent via MCP.

### 3a. Use the CLI

```bash
conducks query <name>     # Find a symbol by name
conducks explain <id>     # Risk breakdown for a symbol
conducks impact <id>      # What breaks if I change this?
conducks trace <id>       # Trace execution from a symbol
conducks audit            # Detect circular deps, god objects, orphans
conducks status           # Project health summary
conducks mirror           # Open the visual graph dashboard on port 3333
```

![Conducks Mirror dashboard](assets/arch.png)

### 3b. Use it with an AI agent (MCP)

Add the following to your agent's MCP config. Replace `/absolute/path/to/conducks` with the path where you cloned the repo (run `pwd` inside the folder to get it).

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
	"mcpServers": {
		"conducks": {
			"command": "node",
			"args": [
				"/absolute/path/to/conducks/build/src/interfaces/cli/index.js",
				"mcp"
			],
			"env": {
				"CONDUCKS_FORCE_RELOAD": "true"
			},
			"disabled": false
		}
	}
}
```

**Antigravity** (`~/.gemini/antigravity/mcp_config.json`):

```json
{
	"mcpServers": {
		"conducks": {
			"command": "node",
			"args": [
				"/absolute/path/to/conducks/build/src/interfaces/cli/index.js",
				"mcp"
			],
			"env": {
				"CONDUCKS_FORCE_RELOAD": "true"
			},
			"disabled": false
		}
	}
}
```

The agent will now have access to these tools:

| Tool               | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `conducks_query`   | Find any symbol by name or pattern             |
| `conducks_status`  | Project health summary and entry points        |
| `conducks_explain` | 6-Signal Risk breakdown for a specific symbol   |
| `conducks_impact`  | See what breaks if you change a symbol         |
| `conducks_trace`   | Trace execution between two symbols            |
| `conducks_audit`   | Detect circular deps, god objects, orphans     |
| `conducks_diff`    | Structural diff of uncommitted changes         |
| `conducks_rename`  | Graph-verified safe rename across the codebase |
| `conducks_guard`   | Block commits if structural risk is too high   |
| `conducks_guide`   | Architectural guidance and standards           |

---

## CLI reference

```bash
conducks setup                    # Initialize Conducks in a project
conducks analyze                  # Parse and index the codebase
conducks watch                    # Auto-reindex on file changes while you work
conducks query <name>             # Find a symbol by name
conducks list                     # List all indexed symbols
conducks status                   # Project health summary
conducks explain <id>             # Risk breakdown for a symbol
conducks impact <id>              # What breaks if I change this?
conducks trace <id>               # Trace execution from a symbol
conducks audit                    # Detect circular deps, god objects, orphans
conducks advise                   # Refactor suggestions based on the graph
conducks diff                     # Structural diff of uncommitted changes
conducks rename <id> <new-name>   # Graph-verified safe rename
conducks guard                    # Block commits if risk threshold exceeded
conducks blueprint                # Generate BLUEPRINT.md from the graph
conducks bootstrap-docs <name>    # Scaffold project documentation
conducks mirror                   # Open the visual graph dashboard
conducks mcp                      # Start the MCP server
```

---

## Supported languages

| Language                | Support level |
| ----------------------- | ------------- |
| TypeScript / JavaScript | Full          |
| Python                  | Full          |
| Go                      | Full          |
| Rust / C++ / C          | High          |
| Java / C#               | High          |
| PHP / Ruby / Swift      | High          |

---

## Language analysis feature matrix

This table shows the core analysis features supported per language. A check (✓) indicates the capability is implemented for the given language.

| Language   | Imports | Named Bindings | Exports | Heritage | Type Annotations | Constructor Inference | Config | Frameworks | Entry Points |
| ---------- | ------: | -------------: | ------: | -------: | ---------------: | --------------------: | -----: | ---------: | -----------: |
| TypeScript |       ✓ |              ✓ |       ✓ |        ✓ |                ✓ |                     ✓ |      ✓ |          ✓ |            ✓ |
| Python     |       ✓ |              ✓ |       ✓ |        ✓ |                ✓ |                     ✓ |      ✓ |          ✓ |            ✓ |
| Go         |       ✓ |              ✓ |       ✓ |        ✓ |                ✓ |                     ✓ |      ✓ |          ✓ |            ✓ |

Further detail and a machine-readable feature matrix for TypeScript are available in `docs/analysis/ts-feature-matrix.json`.

## The 9-Layer Canonical Taxonomy

Conducks organizes your codebase into 9 distinct levels of architectural depth:

| Rank | Kind | Description |
| :--- | :--- | :--- |
| **0** | **ECOSYSTEM** | Cross-repo dependencies and third-party packages |
| **1** | **REPOSITORY** | The current project or microservice boundary |
| **2** | **NAMESPACE** | Folders, modules, and logical groupings |
| **3** | **UNIT** | Individual source files |
| **4** | **INFRA** | Key architectural hubs (Services, Runners, Routers) |
| **5** | **STRUCTURE** | Standard classes, models, and data types |
| **6** | **BEHAVIOR** | Methods, functions, and execution logic |
| **7** | **ATOM** | Variables, constants, and atomic literals |
| **8** | **DATA** | Persistent records and data-store interactions |

---

## How it works

1. **Topological Pulse**: Conducks uses Tree-sitter and the **Gnosis Regex Engine** to parse every file.
2. **Taxonomic Extraction**: Symbols are extracted and grouped into the 9-layer canonical ranks.
3. **The Great Binding**: Import and call relationships are resolved to connect the global graph.
4. **Resonance Vault**: Everything is stored in a local DuckDB vault inside `.conducks/`.
5. **Visual Mirror**: CLI, MCP, and the Mirror dashboard all provide safe, read-only access to the graph.

All analysis runs locally. No data leaves your machine.

---

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal design and layer taxonomy
- [CHANGELOG.md](./CHANGELOG.md) - Release history
- [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute

---

_v1.0.1 | Apache 2.0 |_
