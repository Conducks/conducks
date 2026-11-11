# 🏺 Changelog — Conducks: Structural Resonance

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.1] — 2026-11-11

### Changed
- `docs/` left the repository. conducks ships code only; the project notes live in the owner's private, unversioned folder. The one test that read an ADR from `docs/` now checks the code alone.
- A tool call that leaves a required parameter out is refused with `MISSING_PARAMETER` and the required names, beside `UNKNOWN_PARAMETER`. `conducks_coverage {}` used to answer with a raw Node error.

### Fixed
- The MCP handshake and `conducks_status` reported version 2.0.0 for every release; both now read `package.json`. The release check compares the MCP handshake too.
- The full suite is green again. Three integration tests still read the pre-0.8.0 answer shape (absolute ids, arrays instead of `{cols, rows}`) and failed on the published 0.8.0; they now decode the compact answer. `conducks setup` reads the vault filename from its contract instead of a copy.
- README matches 0.8.0: the new Mirror, compact MCP answers, `--version`, `monitor`; removed `rename`, `fallback` and `audit --fallback`, which do not exist. The release check now also compares the README footer.

## [0.8.0] — 2026-11-11

First release on npm: `npm i -g conducks`, then `conducks setup` in a project.

### Changed
- A full analyze is about 3× faster on a repeat run (43 s → 13 s on conducks itself; 598,000 lines in about 22 s): file history comes from one `git log` per repo instead of one per file, blame is cached per file version under `.conducks/blame-cache/`, and linker results are applied in one pass.
- MCP answers are compact: paths are relative to `meta.root`, and a list of same-shaped items comes as `{cols, rows}`. The same 12 sample calls cost 58% fewer tokens with identical content. A client that parsed the old shape must read `cols`/`rows`.
- A tool call with a parameter the tool does not have is refused with `UNKNOWN_PARAMETER` and the accepted names. It used to be ignored, so `conducks_query {"query": …}` answered with unrelated symbols.
- `conducks setup` is the only project step: it registers the MCP server in Claude Desktop, Claude Code, Cursor, Windsurf, Antigravity, Gemini CLI and Codex when they are installed, and builds the first graph (`--no-analyze` skips it).
- `conducks mirror` is one picture instead of a force graph: the modules in layers with their links, a strip of seven readings (a score and six checks) that light up where each problem lives, and one card for detail. Click a module to see what a change to it can reach. No library is loaded; the force graph and its vendored d3 files are removed.
- The installer no longer deletes `conducks-docs` or `conducks-visuals` from a skills folder. They stopped shipping, and an installed copy is left alone.

### Fixed
- The Mirror graph never drew in the previous build (`t.quadtree is not a function`).
- The TypeScript recall oracle counted calls inside vendored, minified files that analyze ignores.

### Added
- `conducks --version` and `npm run release:check` (lockfile, changelog, build, website and tag must agree before a publish).
- `conducks graph --at <ref> --json [--ranges <file>]`: the code graph at a named commit as one JSON object: files, symbols (`{name,file,line}`), edges (`{from,to,kind}`), harvested code comments, and the hash of each line range listed in the `--ranges` file. Symbols and edges come from the current graph (`symbols_at`/`edges_at: "head"`); an unknown ref exits 1.

### Removed
- conducks is now code analysis only. The documentation tooling is gone: the `docs-lint`, `docs-status`, `bootstrap-docs`, `glossary`, `features`, `testing`, `visuals-lint`, `record` and `install-hooks` commands, the `conducks_docs` MCP tool, the docs panel and `/api/docs` route of the mirror, the visuals generator scripts, the pre-commit gates written by `setup`, the document-to-code `GOVERNS` edges, and the per-module doc-review part of `monitor`. The documentation and visuals skills are no longer shipped and are removed from existing installs by `setup`. Code comments are still harvested into the graph.

## [1.1.0-Mirror-HD] — 2026-04-06 🏺 💎

### Added 🛰️
- **High-Definition (HD) Mirror UI**: Overhauled the visual explorer with Glacial Glass design, deeper backdrop blurs, and neon-glow accents.
- **Mandatory Structural Skeletons**: Implemented loading skeletons for accurate visual transition during asynchronous node hydration (Rule UI-10).
- **Metric Grid Layout**: Refined the Detail Blade into a clear 2x2 grid system for Complexity, Mass, and Entropy visualization.

### Fixed 🛡️
- **Structural Connectivity Restoration**: Resolved a critical category mismatch between the Synapse vault (`STRUCTURAL`) and the Mirror engine (`LINEAGE`), restoring missing edge visibility.
- **Conducks UI Realignment**: Stripped out all forbidden 'vibe-coded' marketing copy and replaced it with direct, technical terminology across the entire dashboard.
- **Banned Interaction Removal**: Eliminated all illegal hover transforms (Rule UI-102) to ensure architectural stability.
- **Graph Purification**: Purged temporary diagnostic scripts from the structural induction path to ensure 100% core signal.

## [0.8.0-Synapse] — 2026-04-05 🏺

### Added 🧬
- **Incremental Structural Persistence**: Transitioned to a "Delta-Only" flush model. Structural pulses now write only modified units to the vault, reducing IO by ~96% for single-file changes.
- **Auto-Pulse Watcher**: Added the `--pulse` flag to `conducks watch`. When enabled, structural changes are automatically induced and persisted to the DuckDB vault in real-time.
- **Lazy Connection Management**: Implemented "Hit-and-Run" database access for read-only commands (Status, Audit, MCP) to eliminate "Vault Busy" lock contention during active pulses.

### Improved 🛡️
- **Structural Discovery Hardening**: Integrated `IgnoreManager` into the discovery phase. Conducks now correctly ignores its own generated artifacts (`ARCHITECTURE.md`, `.conducks/`) during pulses.
- **Worker Extension Dynamic Resolution**: Hardened the `pulse-worker` path logic to support both development (.ts) and production (.js) environments seamlessly.
- **High-Contrast Logging**: Refined structural resonance logs to clearly indicate node/edge counts for incremental vs full pulses.

---

## [1.0.0] - 2026-04-05
### 🎉 The Conducks Release (Production-Ready)
This milestone marks the transition from "Experimental Tool" to "Industrial Structural Intelligence Platform."

### Added 🏺
- **Atomic Induction Engine**: Full support for 11+ languages (Polyglot Resonance) using Wasm-Tree-Sitter.
- **The Kinetic Mirror**: High-fidelity, real-time visual structural explorer at `port 3333`.
- **Sentinel Governance**: Deterministic architectural enforcement via `sentinel.json`.
- **Conducks MCP Server**: Standardized 10-tool suite for autonomous agent integration (Antigravity).
- **DuckDB Persistence**: Vectorized vault for sub-millisecond graph traversal across massive monorepos.
- **Conducks 8-Layer Taxonomy**: Standardized structural hierarchy from Ecosystem down to Data.

### Fixed 🛡️
- Resolved Persistent database lock contention in concurrent analyzing/mirroring sessions.
- Hardened CLI help output with domain-grouped structural guidance.
- Synchronized GO and Rust induction providers for 100% structural fidelity.

---
© 2026 Gospel of Technology. Structural Resonance Confirmed.
🏺💎🛡️
