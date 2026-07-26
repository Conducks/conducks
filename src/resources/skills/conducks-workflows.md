<!-- description: How to use the conducks graph to do work: explore an unfamiliar area, debug a failure, measure the blast radius of a change, refactor safely, and audit structural health. One workflow per question, each a short probe sequence with the tool calls to run. Use whenever you are about to read code, change code, or check whether a change was safe. -->

# conducks-workflows

**Ask the graph, then read the code.**

Five questions, five probe sequences. Every probe is a real MCP call. Run `conducks analyze` once
first — these read the graph, and an unanalyzed project has nothing to answer from.

Every result carries `indexStaleness`. Stale means re-analyze before trusting it.

---

## Explore — "where is X, how does this area work?"

```
1  conducks_query({ q: "concept" })              find the symbol. fuzzy, ranked by importance
2  conducks_flows({ min_members: 2 })            the named execution flows. bird's-eye view
3  conducks_context({ symbol: "X", radius: 2 })  neighbours of one symbol, ranked
```

Query first, read files second. The graph knows the shape; grep knows only the text.

Raise `radius` one step at a time. Big radius buries the signal in neighbours.

For a named query template: `conducks_query({ mode: "template" })` lists them
(`find_usages`, `hotspots`, `dead_code`, `cycles`, `entry_points`, …).

---

## Debug — "why did this fail?"

```
1  conducks_query({ q: "<symbol from the stack trace>" })
2  conducks_trace({ symbol: "X" })                          walk the execution path
   conducks_trace({ symbol: "X", target: "Y", mode: "path" })   shortest route between two
3  conducks_context({ symbol: "X", radius: 2 })
```

Read upstream first: callers tell you whether the input was already wrong. Then downstream: callees
tell you how far the damage spreads.

Finish with a test that reproduces the failure and walks the same path you traced. A fix with no
failing-first test is a guess that happened to work.

Log every caught error to stderr with a context prefix, or rethrow it with more information.

---

## Impact — "what breaks if I change this?"

```
conducks_impact({ symbol: "X", direction: "upstream", depth: 5 })
```

- `direction: "upstream"` (default) — the callers. **What breaks.**
- `direction: "downstream"` — what this symbol relies on.
- `depth` 1–10, default 5 — cumulative edge weight, not hop count.
- Returns the top 10; check `truncated` in the meta.

Read `distance` on each affected node:

| distance | meaning | do |
|---|---|---|
| ≈ 1 | direct caller or subclass | update it in the same change |
| ≈ 2 | one indirect hop, or a direct importer | test it |
| > 2 | transitive | note it |

`impactScore` is the sum of `1/distance` across affected nodes. Bands: `<2` low, `2–5` medium,
`5–15` high, `≥15` critical. The tool returns the score; apply the bands yourself.

Treat any blast radius that crosses functional areas, or touches auth or payment code, as high
whatever the score says.

Then `conducks_trace` for the exact steps.

---

## Refactor — "move it without breaking it"

```
1  conducks_impact({ symbol: "X" })     the blast radius, before touching anything
2  <make the change, update every distance-1 caller in the same turn>
3  conducks_audit({ mode: "scan" })     prove no cycle or illegal edge appeared
4  <type-check + run the tests covering the moved code>
```

Rename every reference in one change. A half-renamed symbol compiles in some languages and breaks in
none of the places you looked.

Place extracted code by layer, not by convenience: shared primitives go down toward the base of the
dependency stack, specific logic goes up toward the entry points. Dependencies point one way —
downward — in whatever layer names your project uses.

When a module outgrows one file, split it into parts and give each part its own architecture note
(see the `conducks-docs` skill for what goes in one).

---

## Audit — "is it healthy? what is dead?"

```
1  conducks_audit({ mode: "scan" })     cycles, illegal edges, policy rules
2  conducks_prune({ type: "all" })      ORPHAN · UNUSED_EXPORT · STALE_IMPORT
3  conducks_explain({ symbol: "X" })    why one symbol is flagged
```

Other audit modes: `advice`, `guard` (regression gate, `threshold` default 0.1),
`archeology` (decay over recent pulses), `fallback`.

**A finding is only as good as the edge types it counts.** Before acting on a cycle or a hub
finding, name the edges behind it and ask whether each survives compilation — a type-only import is
erased by the compiler and is not a runtime dependency. State the edge set in the finding.

**`prune` is advisory. Confirm before deleting.** A symbol reached by dynamic dispatch, dependency
injection or a framework entry point has no incoming edge and reads as an orphan. Confirm with
`grep -rn "\bSymbolName\b" <source dirs>` excluding the file that defines it; zero hits means it is
genuinely unused. `UNUSED_EXPORT` usually means drop the `export` keyword, keep the symbol.

Structure is queried, not written: when asked to update an architecture document, query the graph
and let a human author the prose. What conducks writes to disk is its own vault (`.conducks/`) and
nothing else.
