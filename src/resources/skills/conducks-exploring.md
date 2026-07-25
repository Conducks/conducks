<!-- description: Explore the code architecture, understand how parts work together, and map symbol context. Use when you are entering a new part of the codebase or tracing structural dependencies. -->

# Exploring Guidance

Use the graph to locate symbols and map an unfamiliar area before reading files.

## When to Use
- "Where is the core logic for X?"
- "How does this feature work?"
- "What relates to this symbol?"

## Probes

1. **Find the symbol** — `conducks_query({ q: "concept" })`. Fuzzy symbol and pattern search, ranked by gravity; returns the symbol IDs the next probes need. Pass `mode: "template"` with no `template` to list the Oracle templates (`find_usages`, `hotspots`, `dead_code`).
2. **Map the area** — `conducks_flows({ min_members: 2 })`. Lists the named execution flows: each entry point and the symbols it calls. The bird's-eye view of what the system does.
3. **Map the neighborhood** — `conducks_context({ symbol: "filePath::name", radius: 2 })`. Collects nodes around one symbol, upstream and downstream, ranked by relevance. A short name works; a full graph ID is exact.

## Rules

**EXPLORE-1 — Graph before grep** `[severity: medium]`
Start with `conducks_query`. Fall back to text search only when the graph returns nothing.

**EXPLORE-2 — Widen deliberately** `[severity: low]`
Raise `radius` one step at a time. A large radius buries the signal in neighbors.
