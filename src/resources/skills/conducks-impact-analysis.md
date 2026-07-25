<!-- description: Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: "Is it safe to change X?", "What depends on this?", "What will break?" -->

# Impact Analysis

Calculate the structural cost of an edit before making it.

## When to Use
- "What breaks if I modify X?"
- "Show me the dependencies of this class."
- "Is it safe to change this function?"

## Probes
1. **`conducks_impact({symbol: "UserService", depth: 5})`**: structural blast radius.
   - `symbol` (required): graph ID (`file::name`) or a bare name — a bare name resolves to the highest-gravity match.
   - `direction`: `"upstream"` (default — callers: what breaks if this symbol is modified) | `"downstream"` (dependencies: what it relies on). Same default as the CLI and the analyzer.
   - `depth`: 1–10, default 5. Not a hop count — it is the max cumulative **edge weight** walked by Dijkstra.
   - `path`: optional absolute project root.
   - Returns the top 10 affected nodes only; check `truncated` in the meta for more.
2. **`conducks_trace`** after: granular execution steps.

## Kinetic Depth Levels
Distances are weighted, not integer hops (`EXTENDS` 0.5, `IMPLEMENTS` 0.7, `CALLS` 1.0, `CONSTRUCTS` 1.2, `MEMBER_OF` 1.5, `IMPORTS` 2.0, `DEPENDS_ON` 2.5). Read the `distance` on each node:
- **d ≈ 1 (WILL BREAK)**: direct callers and inheritors. MUST be updated.
- **d ≈ 2 (LIKELY AFFECTED)**: one indirect hop, or a direct importer. Should be tested.
- **d > 2 (MAY NEED TESTING)**: transitive effects across the Synapse.

## Risk Assessment Matrix
Bands the analyzer computes from `impactScore` (sum of `1/distance` over affected nodes) — see `src/lib/domain/kinetic/impact.ts:58`:
- **LOW**: score < 2
- **MEDIUM**: score 2–5
- **HIGH**: score 5–15
- **CRITICAL**: score ≥ 15

Caveat: the `risk` label is computed internally but **not returned** by `conducks_impact` or by `conducks impact --json` — both surface `impactScore` / `affectedCount` instead. Apply the bands to the score yourself.

Reviewer's rule of thumb, not values the tool returns: treat any blast radius that crosses functional groups, or touches auth or payment code, as at least HIGH regardless of score.
