# todo19 — a command that needs no graph should not boot one

Status: done
- Acceptance: `conducks monitor`, `docs-status` and `docs-lint` run without initializing the registry or anchoring a vault, and a test names which commands are allowed to skip it

Surfaced by todo17#P2. Three commands answered entirely from markdown and the filesystem, and all three
still paid for the structural engine before they ran.

## Phase 1 — a second list, and a test that owns it
- Builds: 0033
- [x] `NEEDS_NO_REGISTRY` beside `STALENESS_BYPASS` (`src/interfaces/cli/index.ts`), covering `help`, `docs-status`, `docs-lint`, `bootstrap-docs` and `monitor`. `registry.initialize()` is skipped entirely for them, not merely the graph load
- [x] the reason the existing bypass was NOT enough, which is the whole finding here: `isStalenessBypass` guards a `persistence.load()` in `main` that runs AFTER `initialize`, and `initialize` does its own `newPersistence.load(graph)` internally (`registry-bootstrapper.ts:180`). Every command on that list was still loading the graph, one call earlier where the flag could not see it
- [x] both lists are exported values rather than inline literals, and a test asserts `NEEDS_NO_REGISTRY` is a subset of `STALENESS_BYPASS` — a command in the first but not the second would skip init and then be asked for a graph nobody loaded. Also asserted: no writer (`analyze`, `clean`) and no graph reader (`status`, `query`, `impact`, `audit`, `trace`, `prune`, `coverage`) may appear
- [x] measured: `registry.initialize()` is **138ms** on conducks (2,088 nodes) and **393ms** on a 13k-node repo — it scales with graph size because the bulk is the DuckDB read. `docs-lint` and `docs-status` now finish in **0.14s** total, output byte-identical. Recorded in `docs/memory.md`

## Phase 2 — make the boundary provable, not conventional
- Builds: 0033
- [x] `tests/unit/interfaces/cli/no-registry-commands.test.ts` runs each command in a temp directory holding `docs/` and NO `.conducks/`, and asserts it succeeds, creates no vault, and never prints the engine banner. `bootstrap-docs` gets its own throwaway root because it writes files
- [x] that run-it-for-real test is the part that stops the list rotting: a membership assertion keeps passing after someone gives one of these commands a graph dependency, and only executing it without a graph catches that. Same bar the MCP docs layer already meets (CONDUCKS-24)
- [x] the real gain is not speed — these commands now work on a project that has never been analyzed, which is what a fresh clone looks like. `bootstrap-docs` is a first-run command, and requiring a vault to create the docs a vault does not need was backwards
