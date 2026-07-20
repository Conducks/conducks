# core/persistence — the vault (DuckDB) and the pulse transaction

**Layer:** core. Imports contracts only.

**Responsibility:** owns the vault at `.conducks/`, the node/edge schema, and the atomicity of a
pulse. It is the boundary where an in-memory graph becomes rows and back again.

**Boundaries:** it stores what it is given and does not interpret it. It does not decide which nodes
deserve to exist — with one deliberate exception, `pruneTaxonomy`, which runs at the end of every
analyze and is the authority on what survives (see below).

**Deferred / not built:** no migrations. The schema is created if absent; changing a column means
re-analyzing, and `conducks clean` is the supported path. Acceptable because the vault is a derived
artifact — it can always be rebuilt from source.

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
