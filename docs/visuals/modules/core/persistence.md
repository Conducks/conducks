# core/persistence — the vault (DuckDB) and the pulse transaction

**Layer:** core. Imports contracts plus core siblings (`git`, `utils`, `core/registry`) — nothing from
domain or above.

**Responsibility:** owns the vault at `.conducks/` (`core/persistence/persistence.ts`), the node/edge schema, and the atomicity of a
pulse. It is the boundary where an in-memory graph becomes rows and back again.

**Boundaries:** it stores what it is given and does not interpret it. It does not decide which nodes
deserve to exist — with one deliberate exception, `pruneTaxonomy`, which runs at the end of every
analyze and is the authority on what survives (see below).

**Deferred / not built:** no migration FRAMEWORK. There is an additive migration loop — it runs
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for a short list of late columns, so an existing vault
gains them without a re-analyze — and nothing more: no versioning, no down path, no column rename or
type change. Those still mean re-analyzing, and `conducks clean` is the supported path. Acceptable
because the vault is a derived artifact.

**Layer storage lives here too.** `layers`, `node_content`/`node_slots` and `edge_content`/`edge_slots`
hold committed layers content-addressed: a content row per distinct payload, a slot row per layer
that points at one. `content-key.ts` owns the split between hashed (stable) and per-layer (volatile)
columns, `layer-roles.ts` resolves a role to a layer and refuses rather than falling back,
`layer-reachability.ts` decides what may be collected, and `freshness.ts` is the shared watch/monitor
staleness rule. The hot path — `nodes`/`edges` — is untouched by any of it; layers sit BESIDE it.

## The seam that has broken twice

An in-memory `ConducksEdge` carries its data on `.properties` and `.confidence`. There is no
`.metadata` and no `.weight`. The DB columns are named differently, so **both directions of the
round-trip have independently been written against the wrong field**:

- `saveEdges` once read `e.metadata`/`e.weight` and silently wrote `properties={}` on every edge.
- `load` then built `metadata: JSON.parse(row.properties)` — a field the type does not have — so
  every vault-loaded edge had `properties === undefined`. Measured 4971/4971 before the fix.

Both compiled cleanly because the seam is typed `any`. `analyze` was unaffected (it builds edges in
process); everything that *loads* the vault — audit, impact, query, trace, prune — saw stripped
edges. A save-side test is what allowed the second half to survive the first fix, so the regression
test asserts the **full** save→load cycle. Treat any change here as high-risk and test round-trip.

## The taxonomy prune is authoritative

The taxonomy enum declares 13 kinds; a persisted graph has 9. `pruneTaxonomy` deletes DATA outright
and keeps an ATOM only if it carries a non-structural reference edge. Emission and the persisted
graph disagree **by design** — do not "fix" the enum to match. To change what survives, edit
`pruneTaxonomy`. Rationale in ADR 0012, decision in ADR 0013.

## Atomicity

Purge, flush, rank and save run in one transaction. A killed `analyze` never reaches the commit, so
DuckDB rolls it back on next open and the previous good graph survives. Backstop: `status` flags
density < 0.5 on 50+ nodes as an incomplete pulse. Only one read-write connection may be open at a
time — the CLI holds read-write, the MCP server read-only; two writers deadlock.

## Adding a field that survives a load takes SIX edits, and missing one is silent

A value written onto a node reaches the vault only if every place below knows about it. This has now
bitten twice — the route/request columns (todo22#P15) and `instance_of` (ADR 0082) — with the same
signature both times: the feature works on a fresh parse and does nothing after a reload.

`addNode` keeps a FIXED SKELETON and discards the rest, and a shallow load fetches real columns only
and never the `metadata` blob — and shallow is the load `analyze` uses. So the blob is not a place a
value can live if the pulse must read it.

The six: the `nodes` schema, the additive migration list, BOTH SELECT lists in `load()`, the row
built in `saveNodes`, the `addNode` skeleton in `adjacency-list.ts`, and the content/volatile
classification in `content-key.ts` — whose guard test is the only one of the six that fails loudly.

## The visual wave cap is a DEFAULT, not a contract

`getVisualWave` caps at `DEFAULT_WAVE_CAP` (1,500) because a force graph of every node is
unreadable, and it reports truncation rather than hiding it (ADR 0079). The number is not claimed to
be right — only that the surviving slice is the heaviest (`ORDER BY gravity DESC`) and that the
caller is told. It is overridable from both surfaces: `conducks mirror --wave-cap <n>` and
`GET /api/synapse?limit=<n>`. Measured on a five-service monorepo the default hides about a third of
eligible nodes (2,321 of 6,002), which is why an override had to exist at all.
