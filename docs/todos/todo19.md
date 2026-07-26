# todo19 — a command that needs no graph should not boot one

Status: todo
- Acceptance: `conducks monitor`, `docs-status` and `docs-lint` run without initializing the registry or anchoring a vault, and a test names which commands are allowed to skip it

Surfaced by todo17#P2. Three commands answer entirely from markdown and the filesystem, and all three
still pay for the structural engine before they run.

`src/interfaces/cli/index.ts:120` calls `registry.initialize()` for every command. There is already an
`isStalenessBypass` list at `:116` — `monitor` is in it — but that only skips the graph LOAD and the
staleness check that follows; the init before it still loads grammars and anchors a vault. Running
`conducks monitor` prints `Initializing Native Grammar Engine` and `Structural graph loaded (1936 nodes)`
for a report that opens each project's vault READ_ONLY itself and never touches the current one.

This is the CLI's half of the split ADR 0023 made on the MCP surface: a docs-layer tool takes no
connection. The MCP side enforces it (CONDUCKS-24, `tests/unit/interfaces/tools/docs-layer.test.ts`); the
CLI side never did.

## Phase 1 — a second list, and a test that owns it
- [ ] a `NEEDS_NO_REGISTRY` set beside `isStalenessBypass` (`src/interfaces/cli/index.ts:116`) covering `monitor`, `docs-status`, `docs-lint`, `bootstrap-docs` and `help`, skipping `registry.initialize()` entirely rather than only the load
- [ ] the two lists must not drift into contradiction — a command in `NEEDS_NO_REGISTRY` but not in `isStalenessBypass` would skip init and then try to load a graph. Assert one is a subset of the other in a test
- [ ] measure the saving on a cold run of `conducks docs-lint`, and record it in `docs/memory.md` only if it is worth stating

## Phase 2 — make the boundary provable, not conventional
- [ ] a test that runs each `NEEDS_NO_REGISTRY` command in a directory with NO `.conducks/` vault and asserts it succeeds — the same bar the MCP docs layer already meets. That is the property that stops the list rotting: a command that quietly grows a graph dependency fails the test rather than the user
