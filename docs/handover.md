# Handover — 2026-07-25
Status: current

## Where it stands
- **The layer contract is real now.** `conducks guard` enforces ADR 0005 as a default rule — proven
  non-vacuous both directions (raw cross-layer edge dump = 0 on a fresh 1801-node pulse; a
  re-injected `cli → core` import blocks). Getting there routed 74 illegal edges through composition:
  registry facades, one structural `NameIndex` type (NOT `import type` — this rule counts type-only
  imports, unlike cycle detection, and it counts CALLS too), a lazy `import()` in `pulse-worker.ts`
  (standalone process, cannot be injected), and a documented `cli → mcp` launcher exception beside
  `cli → web`. todo06 closed for real this time. `sentinel.default.yml` deleted (zero readers,
  divergent second source).
- **Java, PHP and Swift extract again** (todo13 closed). Root causes: java `superclass:` holds a
  wrapper node; php grammar 0.24.2 deleted `namespace_aliasing_clause` (4 broken patterns); swift has
  no `struct_declaration` — everything is `class_declaration declaration_kind:` (11 corrections).
  Canary tests (15+15+25) compile the FULL query so the next grammar bump fails loudly. **Java and
  Swift emit the graph's first EXTENDS/IMPLEMENTS edges** — the co-capture recipe TS/Go need is now
  proven in-repo and recorded in todo11.
- **MCP impact direction settled**: `upstream` (= what breaks) is the default on every surface, and
  the handler echoes the applied default. Before, a schema-honoring client and a param-omitting
  client got opposite answers.
- **Suite is deterministic again**: `workerIdleMemoryLimit: '1KB'` recycles the jest worker per file
  — DuckDB stays serial, each grammar suite gets a fresh process (the tree-sitter native addon
  serves ONE wrapper per process). 99/99 × 3 plain runs. NEVER verify with `--runInBand` — it
  bypasses workers and reintroduces the collision (memory.md).
- **Claude Desktop config fixed** — was pointing at a nonexistent `build/index.js` with no `mcp` arg
  since an old `setup` run; the setup command that wrote it is also fixed (resolves the install root
  from `import.meta.url`, not cwd). Two stale agent worktrees removed after verifying their diffs
  were already in main.

## Next, in order
1. **todo11 — port heritage co-capture to typescript/tsx/javascript/go** (the Java pattern is the
   template; the swift agent's traps apply: `is*` captures can overwrite `kind`, and
   `query.matches()` is NOT ordered by pattern index). Then re-derive STALE_IMPORT.
2. **`reflector.ts:368` modifier-capture corruption** — a `@isExported` on a class demotes it to
   ATOM (live-verified), which makes prune deletion possible. Gate the kind branch on a
   DEFINITION_CAPTURES set; spec is in the swift agent's report / todo13 close-out. Blocks Swift
   async/visibility DNA.
3. **todo07 — workspace rollout**, unchanged.
4. Smaller recorded specs: derive the non-Git FS discovery whitelist from registered providers
   (`chronicle-interface.ts:71` omits `.rs .tsx .cs .c .cpp .php .swift`); duplicated
   `prism-core.ts` (parsing vs persistence copies, both live); `conducks list` is a hardcoded stub;
   `GQLParser` has zero callers — wire `--gql` or retire it.
