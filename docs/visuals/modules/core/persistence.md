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
held committed layers content-addressed — and were REMOVED on 2026-08-07 (todo48#P4, ADR 0035
amended). 454 lines, five tables and 95 tests existed to answer a question no command could ask: no
CLI, registry entry or MCP tool referenced any of it, and no pulse ever wrote a layer. What survives
from ADR 0035 is the half that protects an answer — the branch guard in `chronicle.branchRefusal`,
which refuses to answer from a graph pulsed on another branch. `freshness.ts` is unaffected and
remains the shared watch/monitor staleness rule.

## The handle knows where it points, and the bootstrapper must ask IT

`SynapsePersistence` exposes `anchoredAt` — the root it was constructed for. That exists because the
bootstrapper used to decide "do I need a new handle?" from `chronicle.getProjectDir()`, which says
where the REGISTRY is anchored and not what this object opens. The module-level placeholder is
`new SynapsePersistence(":memory:", true)`, so a `:memory:` handle could sit under a chronicle already
anchored to a real repo and read as correct — surfacing as `[No Vault] :memory:` against an analyzed
project (todo52).

Related and easy to get wrong: a CLOSED handle is not a reason to build a new one. `close()` is called
at the end of every tool call so the CLI can use the same file, and `query()` reopens lazily through
`ensureVaultOpen()`. Treating disconnection as a re-init trigger swapped the object on EVERY call —
which is the swap ADR 0146 serialised the whole MCP surface to protect against.

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
and keeps an ATOM only if it carries a non-structural reference edge — **or if it is EXPORTED**
(todo63). Emission and the persisted graph disagree **by design** — do not "fix" the enum to match.
To change what survives, edit `pruneTaxonomy`. Rationale in ADR 0012, decision in ADR 0013.

The export exception exists because a value's use can be completely invisible to the graph: a bare
read produces no edge, so the gate could not tell an exported constant nobody imports from one used
everywhere, and deleted both — leaving `prune` nothing to report. It is bounded and was measured
before it landed: orchestrator +53 nodes (0.80%), sofie +22 (0.21%), scraper unchanged as the python
control, and dangling counts identical on both TypeScript subjects. The flood the gate exists to stop
was a 72% cut, so this is nowhere near re-creating it. A non-exported local with no edges is still
cut, which is the bulk of them.

## Atomicity

Purge, flush, rank and save run in one transaction. A killed `analyze` never reaches the commit, so
DuckDB rolls it back on next open and the previous good graph survives. Backstop: `status` flags
density < 0.5 on 50+ nodes as an incomplete pulse. Only one read-write connection may be open at a
time — the CLI holds read-write, the MCP server read-only; two writers deadlock.

The driver is `@duckdb/node-api`, NAPI rather than ABI-bound (ADR 0149), and two of its behaviours are
load-bearing here. The **instance** owns the file lock and the connection only borrows it, so
`close()` closes both — closing the connection alone leaves the vault locked and `compact()` renames a
file this process still holds open. And a clean close now CHECKPOINTS the write-ahead log away, so a
`.wal` sitting beside the vault is the signature of a CRASH and nothing else, which is what ADR 0037
and ADR 0040 always meant by a stale log.

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
