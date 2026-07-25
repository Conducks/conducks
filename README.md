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

- Node.js 20 or higher (LTS 20/22 recommended). Node 23+ works but needs `npm run bootstrap` — see the [native build note](#supported-languages).
- A C/C++ toolchain for the native `tree-sitter` build (Xcode Command Line Tools on macOS, `build-essential` on Linux)
- Git

### 1. Clone and build

```bash
git clone https://github.com/conducks/conducks
cd conducks
npm run bootstrap && npm run build   # Node 20/22 may use `npm install` instead of bootstrap
npm link
```

`npm run bootstrap` installs dependencies and, on Node 23+, forces the C++20 flag the native
`tree-sitter` build needs (see the [native build note](#supported-languages)). On Node LTS 20/22
plain `npm install` works too.

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
| `conducks_query`       | Find any symbol by name or pattern (fuzzy and template modes) |
| `conducks_status`      | Project health summary, hotspots, and entry points |
| `conducks_explain`     | 6-Signal Risk breakdown for a specific symbol  |
| `conducks_impact`      | See what breaks if you change a symbol (blast radius) |
| `conducks_trace`       | Trace execution or data flow between symbols   |
| `conducks_audit`       | Detect circular deps, god objects, orphans (modes: scan, advice, guard, archeology, fallback) |
| `conducks_context`     | Collect structural context around a symbol within a graph radius |
| `conducks_flows`       | List execution flows — each a named entry point and the symbols it calls |
| `conducks_prune`       | Find dead code: orphaned symbols, unused exports, stale imports |
| `conducks_diff`        | Structural diff of uncommitted changes         |
| `conducks_rename`      | Graph-verified safe rename across the codebase |
| `conducks_graph_query` | Run a raw SELECT against the DuckDB graph store |
| `conducks_guide`       | Architectural guidance and standards           |

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
conducks audit --fallback         # Analyze fallback patterns and legacy detection
conducks advise                   # Refactor suggestions based on the graph
conducks diff                     # Structural diff of uncommitted changes
conducks rename <id> <new-name>   # Graph-verified safe rename
conducks guard                    # Block commits if risk threshold exceeded
conducks status --blueprint       # Integrity readout: cycles, orphans, violations (stdout only)
conducks bootstrap-docs <name>    # Scaffold project documentation
conducks mirror                   # Open the visual graph dashboard
conducks mcp                      # Start the MCP server
```

---

## Supported languages

| Language                      | Support level | Status                                                              |
| ----------------------------- | ------------- | ------------------------------------------------------------------- |
| TypeScript / JavaScript / TSX | Full          | Verified — symbols, edges, frameworks, entry points                 |
| Python                        | Full          | Verified — symbols, edges, entry points                             |
| Rust                          | Full          | Verified — functions, structs, traits, enums, methods               |
| Go                            | Full          | Verified — functions, structs, interfaces, methods, generics        |
| Java / C# / C / C++           | Experimental  | Lens present, extraction not yet verified                           |
| PHP / Ruby / Swift            | Experimental  | Lens present, extraction not yet verified                           |

> **Native build note (Node 23+).** Conducks parses with **native** `tree-sitter` Node bindings
> (runtime `tree-sitter@0.25`). On newer Node releases (23/24/25) the V8 headers require C++20, but
> tree-sitter's `binding.gyp` defaults to C++17 — a plain `npm install` then fails with `"C++20 or
> later required."`. **`npm run bootstrap` handles this automatically** (it sets `CXXFLAGS=-std=c++20`
> on Node ≥ 23, then installs). To do it manually:
>
> ```bash
> CXXFLAGS="-std=c++20" npm install --legacy-peer-deps   # do NOT also set CFLAGS — it breaks the C compile
> ```
>
> Node LTS 20/22 build without the flag. The grammar's language-ABI must match the runtime; the
> bundled grammars (TS, Python, Rust, Go) are all 0.25-ABI compatible.

---

## Language analysis feature matrix

This table shows the core analysis features supported per language. A check (✓) indicates the capability is implemented for the given language.

| Language   | Imports | Named Bindings | Exports | Heritage | Type Annotations | Constructor Inference | Config | Frameworks | Entry Points |
| ---------- | ------: | -------------: | ------: | -------: | ---------------: | --------------------: | -----: | ---------: | -----------: |
| TypeScript |       ✓ |              ✓ |       ✓ |        ✓ |                ✓ |                     ✓ |      ✓ |          ✓ |            ✓ |
| Python     |       ✓ |              ✓ |       ✓ |        ✓ |                ✓ |                     ✓ |      ✓ |          ✓ |            ✓ |
| Rust       |       ✓ |              ✓ |       ✓ |        ✓ |                ✓ |                     ✓ |      ✓ |          ✓ |            ✓ |
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

_v0.7.7 | Apache 2.0 |_
