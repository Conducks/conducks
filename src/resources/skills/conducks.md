<!-- description: Using conducks — what it is, the 14 MCP tools and the CLI, and the probe sequence for each question (explore, debug, impact, refactor, audit). Use when running conducks from the terminal or an MCP client, picking a tool, orienting in an unfamiliar codebase, or checking whether a change was safe. -->

# conducks

A structural intelligence engine. It parses a codebase into a queryable graph — symbols as nodes,
calls and imports as edges, stored in DuckDB — and answers structural questions live from that graph
instead of from prose in a doc.

**Ask the graph, then read the code.** The graph knows the shape; grep knows only the text.

Two surfaces over one graph: **14 MCP tools** and **the CLI**. Same answers, different clients.

---

## §1 Two layers, and why it decides what works right now

| layer | reads | needs `conducks analyze` first? |
|---|---|---|
| **docs** | authored markdown under `docs/` | **no** — any folder, no database, no lock |
| **code** | the structural graph in `.conducks/` | **yes** — an unanalyzed project has nothing to answer from |

Docs layer: `conducks_docs` · `docs-status` · `docs-lint` · `monitor` · `bootstrap-docs` · `help`.
Everything else is the code layer. Each MCP tool's description is prefixed `[docs layer]` or
`[code layer]`, so the split survives into any client.

Start a session on the docs layer — it says what is on the table and what the binding decisions are,
instantly, before any pulse has run. Reach for the code layer when you need wiring.

**A running `analyze` locks the vault.** Every code-layer call FAILS — it does not queue:

```
🛡️ [Vault Locked] Another process is WRITING this vault (PID 1234)…
```

Many readers at once is fine; a writer excludes everyone. On a large repo that is minutes. Read the
error and wait rather than concluding conducks is broken. The docs layer holds no connection and
keeps working throughout.

Most responses carry `indexStaleness`. Stale means re-analyze before trusting the answer.

---

## §2 The 14 tools, by the question they answer

**Docs layer**

| tool | answers |
|---|---|
| `conducks_docs` | open threads, rooted at the decisions that own them: each ADR with unfinished work, the todo phases building it, the next task, what is blocked by what. Finished work omitted. `layer="all"` (default) adds conventions + memory — the constraints to load once per session; `layer="board"` omits them for repeat calls; `raw=true` returns the unprojected board |

**Code layer — "where is it, what exists?"**

| tool | answers |
|---|---|
| `conducks_query` | symbol/concept search — fuzzy by name, or a named Oracle SQL template (`find_usages`, `hotspots`, `dead_code`, `cycles`, `entry_points`, …) |
| `conducks_status` | graph health, node/edge counts, staleness. Modes: `health`, `map` (entry points + hotspots), `manifest` (LLM summary), `pulse` (refresh one file) |
| `conducks_graph_query` | raw SELECT against the DuckDB store — anything the templates miss |

**"How does this work, what is around it?"**

| tool | answers |
|---|---|
| `conducks_context` | neighbours within a graph radius, ranked, token-budgeted |
| `conducks_explain` | one symbol's risk profile — gravity, entropy, churn, complexity |
| `conducks_trace` | execution/data flow from a symbol; `mode=path` finds a route to a target |
| `conducks_flows` | every named execution flow — an entry point and the symbols it calls |

**"What breaks if I change it?"**

| tool | answers |
|---|---|
| `conducks_impact` | blast radius; `upstream` (default) = what breaks, `downstream` = what it relies on |
| `conducks_diff` | structural change — uncommitted (git diff mapped to symbols), historical, or drift vs the previous pulse |

**"Is it healthy, what is dead?"**

| tool | answers |
|---|---|
| `conducks_audit` | cycles, god objects, violations. Modes: `scan`, `advice`, `guard` (blocks over a risk threshold), `archeology` (decay over pulses), `fallback` |
| `conducks_prune` | dead code — ORPHAN, UNUSED_EXPORT, STALE_IMPORT |
| `conducks_coverage` | overlays an istanbul `coverage-final.json` onto function spans. A dark (0%) function with no callers is dead; one that was covered and went dark broke |

**Mutation — the only tool that writes source**

| tool | answers |
|---|---|
| `conducks_rename` | graph-verified rename across every structural reference. `dryRun` defaults to true. Re-analyze after a real run |

---

## §3 The five questions, and the probe for each

### Explore — "where is X, how does this area work?"

```
1  conducks_query({ q: "concept" })              find the symbol. fuzzy, ranked by importance
2  conducks_flows({ min_members: 2 })            the named execution flows. bird's-eye view
3  conducks_context({ symbol: "X", radius: 2 })  neighbours of one symbol, ranked
```

Raise `radius` one step at a time — a big radius buries the signal in neighbours.
`conducks_query({ mode: "template" })` lists the named templates.

### Debug — "why did this fail?"

```
1  conducks_query({ q: "<symbol from the stack trace>" })
2  conducks_trace({ symbol: "X" })                               walk the execution path
   conducks_trace({ symbol: "X", target: "Y", mode: "path" })    shortest route between two
3  conducks_context({ symbol: "X", radius: 2 })
```

Read upstream first — callers tell you whether the input was already wrong. Then downstream —
callees tell you how far the damage spreads.

Finish with a test that reproduces the failure and walks the path you traced. **A fix with no
failing-first test is a guess that happened to work.** Log every caught error to stderr with a
context prefix, or rethrow it with more information.

### Impact — "what breaks if I change this?"

```
conducks_impact({ symbol: "X", direction: "upstream", depth: 5 })
```

`depth` 1–10, default 5 — cumulative edge weight, not hop count. Returns the top 10; check
`truncated` in the meta.

| `distance` | meaning | do |
|---|---|---|
| ≈ 1 | direct caller or subclass | update it in the same change |
| ≈ 2 | one indirect hop, or a direct importer | test it |
| > 2 | transitive | note it |

`impactScore` is the sum of `1/distance` across affected nodes. Bands: `<2` low · `2–5` medium ·
`5–15` high · `≥15` critical. The tool returns the score; apply the bands yourself.

Treat any blast radius that crosses functional areas, or touches auth or payment code, as high
whatever the score says. Then `conducks_trace` for the exact steps.

### Refactor — "move it without breaking it"

```
1  conducks_impact({ symbol: "X" })     the blast radius, before touching anything
2  <make the change, update every distance-1 caller in the same turn>
3  conducks_audit({ mode: "scan" })     prove no cycle or illegal edge appeared
4  <type-check + run the tests covering the moved code>
```

Rename every reference in ONE change — a half-renamed symbol compiles in some languages and breaks
in none of the places you looked.

Place extracted code by layer, not by convenience: shared primitives go down toward the base of the
dependency stack, specific logic goes up toward the entry points. Dependencies point one way.

When a module outgrows one file, split it into parts and give each part its own architecture note
(`conducks-docs`).

### Audit — "is it healthy, what is dead?"

```
1  conducks_audit({ mode: "scan" })     cycles, illegal edges, policy rules
2  conducks_prune({ type: "all" })      ORPHAN · UNUSED_EXPORT · STALE_IMPORT
3  conducks_explain({ symbol: "X" })    why one symbol is flagged
```

**A finding is only as good as the edge types it counts.** Before acting on a cycle or a hub
finding, name the edges behind it and ask whether each survives compilation — a type-only import is
erased and is not a runtime dependency. State the edge set in the finding.

**`prune` is advisory and deliberately under-reports. Confirm before deleting.** A symbol reached by
dynamic dispatch, dependency injection or a framework entry point has no incoming edge and reads as
an orphan. Verify by SYMBOL, never by import path: `grep -rn "\bSymbolName\b" <source dirs>`
excluding the defining file; zero hits means genuinely unused. `UNUSED_EXPORT` usually means drop the
`export` keyword and keep the symbol.

**Structure is queried, not written.** Asked to update an architecture document, query the graph and
let a human author the prose. What conducks writes to disk is its own vault (`.conducks/`), nothing
else.

---

## §4 Orienting in an unfamiliar codebase

```
1  conducks_status mode=health   does a graph exist, is it fresh?
2  conducks_status mode=map      entry points and hotspots — where the weight sits
3  conducks_flows                what the system actually does, end to end
4  conducks_audit mode=scan      cycles and god objects, so you know the broken parts early
5  conducks_query <name>         then conducks_context around it
```

Before editing anything: `conducks_impact`. Before deleting anything: `conducks_prune`, then
`conducks_impact` on the flagged symbol to confirm nothing calls it.

---

## §5 The CLI

Every command takes an optional trailing `[path]`, defaulting to the current directory.

**Core loop**
- `analyze [path] [--force] [--staged] [--yes]` — build/refresh the graph (the pulse). Incremental by
  mtime: a file untouched since the last pulse is not re-parsed; `--force` re-inducts everything.
  `--yes` bypasses the scope guard's prompt — with no TTY, anything above `ok` is a refusal
- `clean` — wipe the vault for a fresh full analyze
- `status [--mode pulse] [--file <path>] [--json]` — health, counts, density, staleness, hotspots
- `doctor` — Node, DuckDB, **which parse path is live** (native vs Gnosis fallback), vault age, and
  whether a newer release exists

**Docs** (the `conducks-docs` grammar)
- `docs-status [--json] [--all] [--root-only]` — open work: each ADR with unfinished phases, the next
  task, what is blocked
- `docs-lint [--root-only]` — validate against the grammar; **exits 1** on violation (the CI gate)
- `bootstrap-docs [name] [--service]` — scaffold the file set into `docs/`; `--service` omits the
  root-only files
- `monitor [--json] [--stale]` — every registered project: graph freshness, docs violations,
  architecture notes describing changed code. `--dismiss <module>` = "checked, still accurate";
  add `--intent <adr|todo|path>` when an enhancement landed, and the address must exist

Both docs commands are **RECURSIVE**: a monorepo keeps a `docs/` per service, so they read the root
tree AND every service tree. Declare services in `conducks.json` (`{"services": ["app", …]}`);
without it they are guessed from which folders hold a `docs/`.

```
✓ (root)            43 governed docs conform to the grammar.
✓ admin             3 governed docs conform to the grammar.
✖ app               1 file(s) violate the grammar:
✓ packages/core     3 governed docs conform to the grammar.
```

`docs-lint` fails if ANY tree fails — that is what makes it a real gate. The old root-only behaviour
reported 43 docs clean and exited 0 while a broken phase sat unread in `app/docs/`. `--root-only`
restores the single-tree run.

**Coverage and drift**
- `coverage <coverage-final.json> [--all] [--json]` — per-function fill % and branch coverage
- `coverage --save-baseline` / `--vs-baseline` — snapshot, then "was 86% → now 0% (BROKE)"
- `coverage-view <cov.json> [--out x.html] [--watch]` — self-contained HTML overlay, live re-render

**Architecture governance**
- `audit [--fallback] [--history=<window>]` — cycles (ARCH-3), self-imports (ARCH-4), **mutual call
  tangles (ARCH-6)**, god objects, orphans. ARCH-6 is informational and never fails the audit:
  mutual recursion is legal, a knot with no entry order is not, and only a human tells them apart
- `guard [--threshold=N] [--force]` — layer contract, cycles, rank rules; blocks violations
- `advise` — structural advice · `ledger` — the decision/architecture ledger
- `drift [prevPulseId]` · `diff [--base <id>] [--head <id>]` — structural change between pulses
- `supply-chain [--deps-only]` — the third-party surface, with each import's origin

**Symbol intelligence**
- `query <pattern> [--mode fuzzy|template] [--template <id>] [--limit <n>] [--json]`.
  `query "*"` is the INVENTORY — every symbol by structural gravity, heaviest first, for reading a
  codebase top-down instead of searching a name you already know
- `explain <id>` — 6-signal risk breakdown · `context <id> [--json]`
- `impact <id> [upstream|downstream] [--tree]` · `trace <id> [--flow]` · `flows`
- `entry` — real entry points · `cohesion <id1> <id2>` · `entropy <id>` — authorship entropy
- `list` — the anchored workspace and any FEDERATED projects linked to it (not a symbol list)
- `fallback` — suspicious fallback patterns
- `prune` — dead code; advisory, under-reports. Verify by SYMBOL, never by import path
- `rename <id> <new> [--confirm]` — graph-verified rename

**Lifecycle**
- `setup` — install skills into `~/.claude/skills`, register the project, configure MCP, write
  `.conducksignore`, install the pre-commit gates. Skills are GLOBAL only; a repo-local copy loads
  twice and setup prunes it. They also re-sync on every `npm run build` of conducks itself, so the
  installed copy never lags the source
- `install-hooks [path] [--force]` — write the docs-lint/visuals-lint gates into
  `.git/hooks/pre-commit` behind managed markers. Idempotent; a foreign hook is appended to with its
  own lines untouched and the gates placed before a trailing `exit 0`; a symlinked hook is left alone
  with an instruction; no `.git` exits quietly; `--force` rewrites wholesale
- `uninstall` — remove the skills conducks installed
- `mcp [--sse] [--root <path>]` — run the MCP server (stdio by default)
- `watch` — live re-analysis on save · `mirror` — web dashboard on port 3333
- `link <path>` — link a neighbouring repo · `resonance <path>` · `record --type <t> "content"`

---

## §6 A monorepo returns one board per tree

`conducks_docs` and both docs commands read the root tree and each unit's, and hand them back
SEPARATELY as `{monorepo: true, trees: {"(root)": …, "app": …}}`. A single repo returns the board
unwrapped, so the common shape never changes. `scope="root"` or `scope="app"` reads one tree.

They are not merged on purpose: `todo01#P2` is an address inside its own tree, and two units may each
hold a `todo01`. Read the tree that owns the work. Decisions and todos live at the repository root;
the living docs — features, conventions, memory, architecture — live in the unit they describe.

---

## §7 Two things that surprise people

- **A running `analyze` locks the vault** (§1). Graph-reading commands fail rather than queue.
- **Native parsing is optional to INSTALL, required to ANALYZE.** The `tree-sitter` binding compiles
  from source, so it is absent wherever there is no C++ toolchain. The CLI still installs and its
  docs commands still work, but `analyze` refuses — there is no second parse path, and writing an
  empty graph that looks real is worse. `doctor` says which state you are in.

---

## The other conducks skills

| skill | use it for |
|---|---|
| `conducks-docs` | the documentation standard — what goes where, the line grammar, code comments |
| `conducks-visuals` | building and maintaining the rendered architecture pages |
| `conducks-feature-clean` | putting a feature behind one door and cleaning behind it |
