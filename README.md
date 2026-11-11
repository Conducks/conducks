<!-- @format -->

# 🏺 Conducks

> **A structural map of your codebase, built from the AST. No embeddings, no guessing.**

Conducks parses your source code with native **Tree-sitter** bindings and extracts every symbol from the **Ecosystem** layer down to the **Atom** layer. It stores the result in a local DuckDB structural vault that stays in sync with your repo. Any AI agent or developer can then ask precise questions about your codebase and get exact, graph-verified answers.

---

## What problem does it solve?

AI coding assistants typically use vector embeddings to find relevant code. That works fine for general snippets, but it breaks down when you need **architectural fidelity**: wrong file returned, symbol doesn't exist, or deep call-chains are missed.

Conducks replaces that fuzzy search with a deterministic structural graph built from your actual AST. Think of it as giving your AI agent a high-resolution map of your system instead of a rough sketch.

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

- Node.js 20 or higher (LTS 20/22 recommended).
- Git. Conducks discovers files via `git ls-files`; outside a Git repo it falls back to a filesystem scan covering every extension the language providers declare, plus `.json .txt .md .env` and `Dockerfile`.
- **Optional:** a C/C++ toolchain, for full-fidelity parsing. Without one Conducks still installs and
  still analyzes, at lower fidelity — see [parsing fidelity](#parsing-fidelity-native-vs-fallback).

### 1. Install

```bash
npm i -g conducks
```

That is the whole install. The native `tree-sitter` bindings are **optional dependencies**: npm
builds them if your machine has a C/C++ toolchain and skips them if it does not, so the install never
fails on a missing compiler. `conducks doctor` shows which parse path you got: `[✓] Parse path: native
tree-sitter, all 13 grammars induced` is full fidelity; `[!] Parse path: Gnosis regex fallback` still
works, at lower fidelity (see [parsing fidelity](#parsing-fidelity-native-vs-fallback)).

<details>
<summary>From source instead (contributors)</summary>

```bash
git clone https://github.com/conducks/conducks && cd conducks
npm run install:global    # installs dependencies, builds, and puts `conducks` on your PATH
```

</details>

### 2. Set up your project

Go into the project you want to analyze and run:

```bash
conducks setup
```

That is the whole setup. It:

- registers the Conducks MCP server in every agent it finds on your machine: Claude Desktop, Claude
  Code, Cursor, Windsurf, Antigravity, Gemini CLI and Codex. A client that is not installed is left
  alone, and every other server in your configs is kept;
- installs the conducks skills and writes `.conducksignore`;
- builds the first graph in `.conducks/` (`conducks analyze`), unless one exists. Pass `--no-analyze`
  to skip, or `--dry-run` to see what it would write.

Restart your agent and it can use the conducks tools. After code changes, `conducks analyze` updates
the graph (only changed files are re-read).

### 3a. Use the CLI

```bash
conducks query <name>     # Find a symbol by name
conducks explain <id>     # Risk breakdown for a symbol
conducks impact <id>      # What breaks if I change this?
conducks trace <id>       # Trace structural dependencies from a symbol
conducks audit            # Detect circular deps, god objects, orphans
conducks status           # Project health summary
conducks mirror           # Open the Mirror at http://127.0.0.1:3333
```

### The Mirror

`conducks mirror` opens a map of your project in the browser. It answers, at a glance:

- **Is the code clean?** Six checks across the top: two-way links, import loops, overloaded files, unused code, untested risky code, oversized files. Click the score to see each one.
- **Is it modular?** Folders are boxes in layers; every arrow is a real import. A link that goes both ways shows in red.
- **Where does it start?** The entry folder is marked `START`; the most-used one `MOST USED`.
- **What does a change reach?** Hover or click a box: everything it can affect lights up, and one line at the bottom says how far it reaches.
- **What is inside?** Click a box to go inside it, down to single files; the side card lists who uses it and the files others lean on most.

![Conducks Mirror](assets/mirror.png)

### 3b. Use it with an AI agent (MCP)

`conducks setup` already did this for the agents listed in step 2. For any other stdio MCP client,
add this block to its config by hand (`conducks` is on your `PATH` after the install):

```json
{
	"mcpServers": {
		"conducks": {
			"command": "conducks",
			"args": ["mcp"],
			"disabled": false
		}
	}
}
```

<details>
<summary>Installed from source instead?</summary>

`npm link` also puts `conducks` on your `PATH`, so the block above still works. If your client cannot
resolve commands from `PATH`, point it at the built entry directly — run `pwd` in the repo for the
absolute path:

```json
{
	"mcpServers": {
		"conducks": {
			"command": "node",
			"args": ["/absolute/path/to/conducks/build/src/interfaces/cli/index.js", "mcp"],
			"disabled": false
		}
	}
}
```

</details>

The server reads the workspace root from `--root <path>`, else from the `CONDUCKS_WORKSPACE_ROOT`
environment variable, else from the current working directory. The default transport is stdio; pass
`mcp --sse` if your client needs an SSE transport instead (served on port 3001).

The agent will then have access to these 12 tools, every one of them read-only. Answers are compact: paths are relative to `meta.root`, and a list of same-shaped items comes as `{cols, rows}`. A parameter the tool does not have is refused with `UNKNOWN_PARAMETER` and the names it accepts.

| Tool                   | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `conducks_query`       | Find any symbol by name or pattern (fuzzy and template modes)                                 |
| `conducks_status`      | Project health summary, hotspots, and entry points                                             |
| `conducks_explain`     | 6-signal risk breakdown for a symbol (gravity, complexity, entropy, churn, fan-out, fallback)  |
| `conducks_impact`      | See what breaks if you change a symbol (blast radius)                                          |
| `conducks_trace`       | Trace execution or data flow between symbols                                                   |
| `conducks_audit`       | Detect circular deps, god objects, violations (modes: scan, advice, guard, archeology) |
| `conducks_context`     | Collect structural context around a symbol within a graph radius                              |
| `conducks_flows`       | List execution flows — each a named entry point and the symbols it calls                      |
| `conducks_prune`       | Find dead code: orphaned symbols, unused exports, stale imports                                |
| `conducks_coverage`    | Overlay an istanbul/c8 `coverage-final.json` onto the graph — per-function fill %              |
| `conducks_diff`        | Structural diff of uncommitted changes                                                         |
| `conducks_graph_query` | Run a raw SELECT against the DuckDB graph store                                                |

Usage guidance for agents does **not** ship as an MCP tool. It ships as a skill that
`conducks setup` copies into `.claude/skills/` — `conducks`.

---

## CLI reference

**Lifecycle**

```bash
conducks setup                    # Configure MCP and install skills
conducks analyze [--staged] [--verbose] [--force]
                                  # Index and analyze repository structure
conducks watch                    # Start real-time monitoring of structural shifts
conducks doctor                   # Check environment health for Conducks
conducks clean                    # Nuclear purge: evict blocked handles and purge the vault
conducks uninstall                # Remove the MCP config + skills that setup installed
conducks mcp [--sse] [--root <path>]
                                  # Launch the MCP server
conducks mirror                   # Start the visual explorer (http://127.0.0.1:3333; --live to auto-refresh)
conducks monitor                  # Graph freshness across every registered project
conducks --version                # Print the installed version
conducks help                     # Show the built-in help (also --help, -h)
```

**Explore**

```bash
conducks query <pattern> [--mode fuzzy|template] [--template <id>] [--limit <n>] [--json]
conducks status [--mode pulse] [--file <path>] [--blueprint] [--json] [path]
conducks explain <symbol_id>      # Risk signal decomposition for a symbol
conducks context <symbolId> [--json]
                                  # Symbol relationships and technical flows
conducks trace <symbol_id> [--flow]
                                  # Structural dependencies (--flow for data lineage)
conducks impact <symbolId> [upstream|downstream] [--json] [--tree]
                                  # Blast radius analysis
conducks flows                    # List behavioral processes across the graph
conducks entry [path]             # List detected entry points (API, CLI, Main)
```

**Govern**

```bash
conducks audit [--history=<window>] [--json]
                                  # Structural integrity and governance audit
conducks guard [--threshold=N] [--force]
                                  # Enforce stability thresholds (note: --threshold=N, not --threshold N)
conducks advise                   # Architectural recommendations
conducks diff [--base <id>] [--head <id>]
                                  # Structural risk of the current changes
conducks drift [prevPulseId]      # Architectural drift between two pulses
conducks prune                    # Unused exports and dead code
conducks supply-chain [--deps-only]
                                  # Dependency / boundary surface (stdlib vs versioned deps)
```

**Coverage and graph export**

```bash
conducks coverage <coverage-final.json> [--json] [--all] [--save-baseline] [--vs-baseline] [path]
                                  # Overlay istanbul/c8 coverage onto the graph
conducks coverage-view <coverage-final.json> [--out coverage.html] [--watch] [path]
                                  # Render the overlay as a static HTML file
conducks graph --at <ref> --json [--ranges <file>]
                                  # The code graph at a commit as one JSON object
```

**Federation**

```bash
conducks list                     # Show the anchored workspace and any linked federated projects
conducks link <path>              # Link a foundation synapse
```

---

## Supported languages

Every language below is parsed with a native Tree-sitter grammar and a per-language query file.
"Verified" means a real `analyze` run on sample sources produced the listed nodes.

| Language                | Support level | Verified behavior                                                                   |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------- |
| TypeScript / TSX        | Full          | symbols, imports + per-binding imports, calls, type-usage edges, React hook nodes   |
| JavaScript / JSX        | Full          | symbols, ES + CommonJS `require` imports, calls                                     |
| Python                  | Full          | symbols, imports + named bindings, calls                                            |
| Go                      | Full          | functions, structs, interfaces, methods, generics, type-usage edges                 |
| Rust                    | Partial       | functions, structs, traits, enums, impl methods — no per-binding imports, no type-usage edges |
| C / C++                 | Partial       | structs/classes, functions, methods — no per-binding imports, no type-usage edges   |
| C#                      | Partial       | namespaces, classes, methods — properties are not extracted                         |
| Ruby                    | Partial       | classes and methods                                                                 |
| Java                    | Partial       | classes, records, interfaces, enums, methods, fields, imports, **EXTENDS/IMPLEMENTS heritage**; no constructors (name-collision with the class), no annotations, no type-usage edges |
| PHP                     | Partial       | namespaces, classes, traits, interfaces, enums, methods, functions, typed properties, use-imports incl. aliases; no heritage edges, no constants or enum cases |
| Swift                   | Partial       | classes, actors, structs, enums, extensions, protocols, funcs/init/deinit, properties, enum cases, typealiases, **conformance + superclass heritage**; no subscripts, no property wrappers, no async/visibility DNA |

Two limits apply to every language:

- **Inheritance edges exist only for Java and Swift** (since 2026-07-25 — their heritage patterns
  co-capture the subject, which `reflector.ts:438` requires). TypeScript, TSX and Go still persist
  zero `EXTENDS`/`IMPLEMENTS`: their heritage patterns capture `@heritage` alone, so the reflector
  drops the match. The Java fix is the recipe (todo11).
- **Type-usage edges only for TypeScript, TSX and Go.** Other languages have no type-position
  capture, so type-only-import detection never fires for them.

**How the fallback works.** If a native grammar fails to load, a parse crashes, or a query fails to
compile, Conducks does not error out — it degrades that file to the **Gnosis** path, which emits a
single file-level node and no symbols. Counts drop silently, so a language that looks "supported" can
be contributing nothing. Run with `CONDUCKS_DEBUG=1` to see the fallback messages.

### Parsing fidelity: native vs fallback

Conducks parses with **native** `tree-sitter` Node bindings (runtime `tree-sitter@0.25`). They are
**optional dependencies**, so a machine without a C/C++ toolchain still installs Conducks — it just
runs on the Gnosis fallback described above, which emits one file-level node per file and no symbols.
Run `conducks doctor` to see which path is live; it prints the toolchain command for your platform
when the native path is missing.

To get the native path:

| platform | install the toolchain with |
| --- | --- |
| macOS | `xcode-select --install` |
| Debian/Ubuntu | `apt install build-essential` |
| Windows | Visual Studio Build Tools (C++ workload) |

Then reinstall: `npm i -g conducks`.

**Node 23+ needs one extra flag.** The V8 headers require C++20 while tree-sitter's `binding.gyp`
defaults to C++17, so the native build fails with `"C++20 or later required."` — and because the
bindings are optional, npm reports that as a skipped optional dependency rather than an error, leaving
you silently on the fallback. Node LTS 20/22 build without the flag. From source,
`npm run bootstrap` sets it automatically on Node ≥ 23; manually:

```bash
CXXFLAGS="-std=c++20" npm install --legacy-peer-deps   # do NOT also set CFLAGS — it breaks the C compile
```

The grammar's language-ABI must match the runtime.

---

## The 9-layer canonical taxonomy

Conducks normalizes every language's own node kinds (`semantic_kind`) into one canonical set
(`canonicalKind`), ordered from the broadest container to the narrowest symbol:

| Kind           | What it holds                                          |
| -------------- | ------------------------------------------------------ |
| **ECOSYSTEM**  | Cross-repo dependencies and third-party packages       |
| **REPOSITORY** | The current project or microservice boundary           |
| **PACKAGE**    | A deployable/versioned unit inside a workspace         |
| **DIRECTORY**  | Filesystem folders                                     |
| **UNIT**       | Individual source files                                |
| **INFRA**      | Architectural hubs (routers, controllers, decorators)  |
| **STRUCTURE**  | Classes, interfaces, structs, enums, types             |
| **BEHAVIOR**   | Functions, methods, constructors                       |
| **ATOM**       | Variables, properties, constants, fields               |

The enum in `taxonomy.ts` declares 13 kinds — it also lists `NAMESPACE`, `STATEMENT`, `BRANCH` and
`DATA` — but the vault is pruned at the end of every `analyze`: `DATA` is deleted outright, and an
`ATOM` survives only if it carries a real reference edge. So the persisted graph has the 9 kinds
above. **BEHAVIOR is the deepest routinely-emitted node**; parameters and local variables live as
attributes on their parent, not as graph nodes.

---

## How it works

1. **Discovery**: files are listed from Git (`git ls-files`, submodules included), filtered by `.conducksignore`.
2. **Structural pulse**: each file is parsed with its native Tree-sitter grammar and query file; anything that fails to parse degrades to the Gnosis file-level fallback.
3. **Taxonomic extraction**: symbols are normalized from the language's own kinds into the canonical taxonomy.
4. **Linking**: import, call, construct and type-reference relationships are resolved into a global graph.
5. **Vault**: nodes and edges are written to a local DuckDB database inside `.conducks/`, then the taxonomy prune runs.
6. **Read surfaces**: the CLI, the MCP server, and the Mirror dashboard all provide read-only access to that graph.

All analysis runs locally. No data leaves your machine.

**Speed.** A repeat analyze of conducks itself (about 84,000 lines) takes about 13 s; 598,000 lines take about 22 s. History comes from one `git log` per repo, and blame is cached per file version under `.conducks/blame-cache/`. Only changed files are re-read.

---

## Docs

- [CHANGELOG.md](./CHANGELOG.md) - Release history
- [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute

---

_v0.8.1 | Apache 2.0_
