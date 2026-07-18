# CLI Quality Improvements — Wave 10 Agent Run

Date: 2026-06-21

## Changes Implemented

### CLI2 — Shared error helper (new file)
`src/interfaces/cli/shared/error.ts`
- `cliError(code, message, suggestion?)` — writes to stderr, exits with code 1
- `cliWarn(message)` — writes warning to stderr

### CLI3 — EPIPE handling
`src/interfaces/cli/index.ts`
- Added `process.stdout.on('error', ...)` guard at top of module to exit cleanly on pipe close

### CLI1 — --json flag on query, impact, status
- `query.ts`: `--json` outputs raw node array as JSON; template mode outputs raw results array
- `impact.ts`: `--json` outputs impact + composite risk as structured JSON object
- `status.ts`: `--json` outputs stats, status, staleness, topHotspots as JSON

### CLI7 — Table output for query command
`src/interfaces/cli/commands/query.ts`
- Fuzzy mode now renders aligned columns: RANK / KIND / NAME / FILE / CONFIDENCE
- Uses `col(s, w)` padding helper — no external deps

### CLI8 — Tree output for impact command
`src/interfaces/cli/commands/impact.ts`
- Added `--tree` flag; renders affected nodes grouped by distance level using `├──` / `└──` / `│   `
- `renderTree()` is a module-level function (not a method) to avoid `this` binding issues

### CLI4 — Uninstall command (new file)
`src/interfaces/cli/commands/uninstall.ts`
- Reads Claude Desktop MCP config at `~/Library/Application Support/Claude/claude_desktop_config.json`
- Removes `conducks` key from `mcpServers`, writes atomically via tmp+bak pattern (same as MCPConfigurator)
- Registered in `index.ts`, added to staleness bypass list

### CLI5 — Doctor command (new file)
`src/interfaces/cli/commands/doctor.ts`
- Checks: Node.js version (warn < 18), DuckDB importable, tree-sitter installed, git on PATH
- Checks `.conducks/` vault existence; reports last pulse time from DB mtime
- Registered in `index.ts`, added to staleness bypass list

### CLI6 — Examples in help
`src/interfaces/cli/commands/help.ts`
- Added `EXAMPLES` section at bottom with 7 representative commands
- Domain entries now carry `examples` array in internal structure (not printed per-domain to keep output clean)
- `uninstall` and `doctor` added to SYSTEM domain listing

## Type Check
`npx tsc --noEmit` — zero errors
