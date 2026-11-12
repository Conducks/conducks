<!-- description: Using conducks — what it is, the 12 MCP tools and the CLI, and the probe sequence for each question (explore, debug, impact, refactor, audit). Use when running conducks from the terminal or an MCP client, picking a tool, orienting in an unfamiliar codebase, or checking whether a change was safe. Reach for it whenever the question is structural and the answer must be TRUE rather than plausible — even when the user never says "conducks": "what breaks if I change this", "what calls this", "is anything using it", "how does X actually work", "is there a cycle". Those are graph questions, and grep answers them by coincidence. -->

# conducks

A structural intelligence engine. It parses a codebase into a queryable graph — symbols as nodes,
calls and imports as edges, stored in DuckDB — and answers structural questions live from that graph
instead of from prose.

**Ask the graph, then read the code.** The graph knows the shape; grep knows only the text.

Two surfaces over one graph: **12 MCP tools** and **the CLI**. Same answers, different clients.

---

**Owns:** which tool answers which structural question · the probe sequence per question · the CLI.
**Does not own:** doors, dead code and tests that bite → `conducks-feature-clean` · running several
agents at once → `multi-agent-protocol`.

---

## §1 What needs `conducks analyze` first

Every tool reads the structural graph in `.conducks/`, so an unanalyzed project has nothing to
answer from: run `conducks analyze` first.

**A running `analyze` locks the vault.** Every code-layer call FAILS — it does not queue:

```
🛡️ [Vault Locked] Another process is WRITING this vault (PID 1234)…
```

Many readers at once is fine; a writer excludes everyone. On a large repo that is minutes. Read the
error and wait rather than concluding conducks is broken.

Most responses carry `indexStaleness`. Stale means re-analyze before trusting the answer.

---

## §2 The 12 tools, by the question they answer

**"Where is it, what exists?"**

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
| `conducks_audit` | cycles, god objects, violations. Modes: `scan`, `advice`, `guard` (blocks over a risk threshold), `archeology` (decay over pulses) |
| `conducks_prune` | dead code — ORPHAN, UNUSED_EXPORT, STALE_IMPORT, UNUSED_MEMBER (Java methods and private fields) |
| `conducks_coverage` | overlays an istanbul `coverage-final.json` onto function spans. A dark (0%) function with no callers is dead; one that was covered and went dark broke |

**Nothing here writes to your code.** Every tool is a reader; conducks writes only its own vault.
A rename is your editor's job, because it needs types and conducks has a syntax graph.

**A capability grep already provides is not worth shipping.** Before adding or keeping a command,
ask what it does that `grep` cannot. If the honest answer is "the same thing, from a graph", drop it.
A structural surface earns its place only when it is exact enough to act on without re-checking, or
answers something textual search cannot reach at all — blast radius, a call path, a cycle. A surface
strictly worse than a tool everyone already has installed is how a project accumulates commands
nobody runs.

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
in none of the places you looked. Use your editor's rename, which type-checks; conducks has no
writer.

Place extracted code by layer, not by convenience: shared primitives go down toward the base of the
dependency stack, specific logic goes up toward the entry points. Dependencies point one way.

### Audit — "is it healthy, what is dead?"

```
1  conducks_audit({ mode: "scan" })     cycles, illegal edges, policy rules
2  conducks_prune({ type: "all" })      ORPHAN · UNUSED_EXPORT · STALE_IMPORT · UNUSED_MEMBER
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

**Structure is queried, not written.** What conducks writes to disk is its own vault
(`.conducks/`), nothing else.

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

**Monitor and graph export**
- `monitor [--json] [--stale]` — every registered project: graph freshness, branch mismatch, watcher
  state
- `graph --at <ref> --json [--ranges <file>]` — the code graph at a commit as one JSON object: files,
  symbols (`name`, `file`, `line`), edges, harvested code comments, and the hash of each line range
  listed in the `--ranges` file (a JSON array of `{path, start, end}`). An unknown ref exits non-zero

**Coverage and drift**
- `coverage <coverage-final.json> [--all] [--json]` — per-function fill % and branch coverage
- `coverage --save-baseline` / `--vs-baseline` — snapshot, then "was 86% → now 0% (BROKE)"
- `coverage-view <cov.json> [--out x.html] [--watch]` — self-contained HTML overlay, live re-render

**Architecture governance**
- `audit [--history=<window>]` — cycles (ARCH-3), self-imports (ARCH-4), **mutual call
  tangles (ARCH-6)**, god objects, orphans. ARCH-6 is informational and never fails the audit:
  mutual recursion is legal, a knot with no entry order is not, and only a human tells them apart
- `guard [--threshold=N] [--force]` — layer contract, cycles, rank rules; blocks violations.
  **Declare your layers or the contract checks nothing.** With no `layers:` block it matches
  conducks' own directory names, finds nothing in your project, and prints `NOT CHECKED` rather
  than a pass. Declare them in `.conducks/sentinel.yml`:

  ```yaml
  layers:
    - name: contracts
      path: /src/contracts
    - name: domain
      path: /src/domain
      allow: core, contracts
  ```

  `allow` is comma-separated; a layer with no `allow` may depend on nothing outside itself;
  same-layer edges are always legal; fragments match in file order, so put the more specific path
  first. A duplicate name, a missing `path` or an `allow` naming a layer you never declared makes
  the whole contract unusable — `guard` then reports the problem and checks nothing, because a
  verdict computed from the wrong directory names costs more than no verdict
- `advise` — structural advice
- `drift [prevPulseId]` · `diff [--base <id>] [--head <id>]` — structural change between pulses
- `supply-chain [--deps-only]` — the third-party surface, with each import's origin

**Symbol intelligence**
- `query <pattern> [--mode fuzzy|template] [--template <id>] [--limit <n>] [--json]`.
  `query "*"` is the INVENTORY — every symbol by structural gravity, heaviest first, for reading a
  codebase top-down instead of searching a name you already know
- `explain <id>` — 6-signal risk breakdown · `context <id> [--json]`
- `impact <id> [upstream|downstream] [--tree]` · `trace <id> [--flow]` · `flows`
- `entry` — real entry points
- `list` — the anchored workspace and any FEDERATED projects linked to it (not a symbol list)
- `prune` — dead code; advisory, under-reports. Verify by SYMBOL, never by import path

**Lifecycle**
- `setup` — install skills into `~/.claude/skills` (and `~/.agents/skills` for Codex and Gemini CLI,
  `~/.gemini/config/skills` for Antigravity, when installed), register the project, configure MCP for every agent found, write
  `.conducksignore`, build the first graph when there is none. Skills are GLOBAL only; a repo-local copy loads
  twice and setup prunes it. They also re-sync on every `npm run build` of conducks itself, so the
  installed copy never lags the source
- `uninstall` — remove the skills conducks installed
- `mcp [--sse] [--root <path>]` — run the MCP server (stdio by default)
- `watch` — live re-analysis on save · `mirror` — web dashboard on port 3333
- `link <path>` — link a neighbouring repo

### §5.1 Gates

`guard` and `audit` run on demand (cycles, layer violations, god objects). Neither runs by itself:
wire them into your CI or hook if you want them to block.

---

## §6 Two things that surprise people

- **A running `analyze` locks the vault** (§1). Graph-reading commands fail rather than queue.
- **Native parsing is optional to INSTALL, required to ANALYZE.** The `tree-sitter` binding compiles
  from source, so it is absent wherever there is no C++ toolchain. The CLI still installs,
  but `analyze` refuses — there is no second parse path, and writing an
  empty graph that looks real is worse. `doctor` says which state you are in.

---

## The other conducks skills

| skill | use it for |
|---|---|
| `conducks-feature-clean` | putting a feature behind one door and cleaning behind it |
