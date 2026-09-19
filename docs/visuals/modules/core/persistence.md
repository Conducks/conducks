# core/persistence — the vault (DuckDB) and the pulse transaction

**Layer:** core. Imports contracts plus core siblings (`git`, `utils`, `core/registry`) — nothing from
domain or above.

**Responsibility:** owns the vault at `.conducks/` (`core/persistence/persistence.ts`), the node/edge schema, and the atomicity of a
pulse. It is the boundary where an in-memory graph becomes rows and back again.

**Boundaries:** it stores what it is given and does not interpret it. It does not decide which nodes
deserve to exist — with one deliberate exception, `pruneTaxonomy`, which runs at the end of every
analyze and is the authority on what survives (see below).

**Persistence is reached through the driver interface only.** Direct DuckDB calls outside this
module are forbidden, so storage can be swapped without breaking a pulse and the
Connect-Execute-Disconnect lifecycle (below) is enforced in one place rather than everywhere a query
is written. Nothing in `src/` scans for a violation of this today — it holds by convention, not by a
gate. `tools/` and `scripts/` are a separate case: they sit outside `src/` and cannot reach this
layer before a build, so 26 of them once wrote their own driver call after the underlying driver
changed (`duckdb` → `@duckdb/node-api`, ADR 0149) and broke at once — including the benchmark harness
the frozen-subject baselines come from. The fix is `tools/lib/vault.mjs`'s `openVault` helper:
read-only by default, a writer must ask (`{ readOnly: false }`), and every `tools`/`scripts` caller
now goes through it except `tools/upstream-duckdb-repro/`, which is a bug report *about* the old
driver and must keep using it directly.

**A field is read under the name its producer writes.** Before a query or a reconstitution reads a
column, check what actually writes it — a `SELECT` naming a column the table lacks, or a filter on a
property nothing sets, returns empty rather than failing, and empty then reads as a clean answer.
`diff` once reconstituted historical nodes from `row.label`/`row.filePath`, columns the `nodes` table
never had (it stores `canonicalKind` and `file`) — fixed: `src/interfaces/cli/commands/diff.ts` now
reads `node_history` by its real columns (`nodeId, gravity, complexity, fingerprint`).

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

The taxonomy enum declares **10** kinds (<span class="anchor">src/contracts/taxonomy.ts:45</span>);
a persisted graph carries fewer. It said 13 here until 2026-08-17 — that was the count before ADR
0100 cut STATEMENT, BRANCH and DATA and repaired NAMESPACE, and the number sat here unchanged
afterwards. `pruneTaxonomy` deletes DATA outright
and keeps an ATOM only if it carries a non-structural reference edge — **or if it is EXPORTED**
(todo63). Emission and the persisted graph disagree **by design** — do not "fix" the enum to match.
To change what survives, edit `pruneTaxonomy`. Rationale in ADR 0012, decision in ADR 0013.

The export exception exists because a value's use can be completely invisible to the graph: a bare
read produces no edge, so the gate could not tell an exported constant nobody imports from one used
everywhere, and deleted both — leaving `prune` nothing to report. It is bounded and was measured
before it landed: orchestrator +53 nodes (0.80%), subject-c +22 (0.21%), subject-a unchanged as the python
control, and dangling counts identical on both TypeScript subjects. The flood the gate exists to stop
was a 72% cut, so this is nowhere near re-creating it. A non-exported local with no edges is still
cut, which is the bulk of them.

## Recomputes happen in SQL, not row by row

`updateRisks()` recomputes the risk column from what is already stored, in vectorized DuckDB SQL
rather than an application-level loop over rows — that is what keeps it sub-second on a large graph.
A rule once filed for this named "framework coverage" specifically; the one live citation
(`persistence.ts:1090`) is this risk-column recompute, a different feature under the same layer. The
practice is real and applies here; the original wording was just narrower than where it is actually
used.

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

**Uses:** takes the in-memory graph `core/graph` built (nodes, adjacency list) and writes it into the
DuckDB vault under one transaction per pulse; on read, hands rows back in the shape every loader
expects (audit, impact, query, trace, prune all load through here). Uses `core/git` for commit
context, `core/utils` for paths and logging, and registers itself with `core/registry` so other
components can find it.

## Batch ingestion streams; `load()` never should

`src/lib/domain/analysis/index.ts:229` pulls dirty files through `chronicle.streamBatches()`
(`core/git/chronicle-interface.ts`) so a 1,000+ file repo never holds every file's essence in memory
at once. That is a WRITE-path rule only. Streaming rows into the graph on the READ side (`load()`,
below) was built and measured worse — 2.4x the peak RSS of the current materialised form (302 MB
against 125 MB) — because the two sides hold different things (ADR 0083). Same word, opposite
answer; do not generalise one path's fix to the other.

## `nodes.fingerprint` cannot answer "did this file change" — it is per SYMBOL

`fingerprint` is a SHA-256 of `path|name|dna` computed per symbol (`core/parsing/reflector.ts:610`).
It looks like a file hash and is not one: a file with no symbols has none at all, and a comment-only
edit changes no fingerprint while the file still needs a re-parse to move every line number below
it. File-level freshness lives in the separate `file_hashes` table instead (created in
`persistence.ts`, read/written by `FileHashGate`). Anything asking whether a file needs re-parsing
goes through `core/persistence/file-hash-gate.ts`'s `FileHashGate`, never through a fingerprint or an
mtime — and `purgeUnits()` (`persistence.ts:844`) drops a file's `file_hashes` row via
`forgetFileHash` (`persistence.ts:1035`) whenever it drops that file's nodes, or the file is
permanently skipped while having no nodes left.

## The hash gate costs 0.7ms and saves 236ms — and every unknown must resolve to "changed"

Measured on a 1,200-file / 13,244-node repo: `FileHashGate.hasChanged`
(`core/persistence/file-hash-gate.ts:39`) costs 0.7ms cold, 0.007ms warm, against 236ms for the
parse-and-relink it lets a caller skip — 331x. The gate may cost time, never correctness: it returns
`false` (unchanged) ONLY on an exact hash match; a missing hash, an unreadable vault or any thrown
error all fall through to doing the work, because a wrongly-skipped file is a silently stale graph —
the one failure conducks exists to prevent.

## DuckDB never reclaims deleted rows — every purge-and-reinsert grows the vault forever

`DELETE` followed by `INSERT` — which is what re-inserting after `purgeUnits()` does — leaves the old
row versions in their row groups permanently. `VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT` and
`FORCE CHECKPOINT` each leave the file byte-identical; the only reclamation is rewriting into a fresh
database. `duckdb_tables().estimated_size` exposes the gap: a real vault reported ~284,123 edge rows
against 12,694 real, ~59,469 node rows against 2,373 — 235.51 MB holding 8.76 MB of data. This is
invisible to latency: DuckDB opened the bloated 235 MB file in 7 ms, same as an 8.76 MB copy — only a
size or estimated-size check catches it (ADR 0037).

## Compacting a vault has two traps: the stale WAL, and a rewrite that GROWS a young vault

`compact()` (`persistence.ts:1789`) rewrites into a temp file and renames it over the vault, gated by
`bloatRatio()`/`reclaimIfBloated()` (`persistence.ts:1759`, `:1778`) so a healthy vault pays almost
nothing. Two failure modes are silent until they bite. DuckDB replays `<db>.wal` on the next open by
FILENAME, so leaving the OLD vault's write-ahead log beside the swapped-in file makes the vault
refuse to open with "Table with name nodes already exists" — `compact()` now removes both logs as
part of the swap. And on a young vault most rows are still in the WAL, so the `.db` file is a small
stub while a materialised database has a floor near 1 MB: the naive rewrite makes it BIGGER, not
smaller — `compact()` measures the result and keeps the rewrite only when it came out smaller.

## The loaded graph retains 21 MB — the other ~180 MB is V8 arena, not a data-structure problem

`load()` (`persistence.ts:541`) leaves RSS at ~199 MB on a 2,402-node / 12,697-edge repo. Forcing two
GCs after the load drops heap from 53 MB to **21 MB** while RSS does not move — the graph itself
retains 21 MB; the rest is V8 arena grown to hold transient garbage during the load, not yet returned
to the OS. This kills representation-rewrite ideas before they cost a week: `Set<Edge>` versus
`Array<Edge>` for the edge indexes measured 1.8 MB against 1.7 MB, and narrowing `SELECT *` to the 18
columns `load()` reads saved 10ms and no memory. The levers that actually work are not loading at all
(ADR 0038's deferral, `governance.statusFromVault()`) and reducing transient garbage — streaming rows
into the graph measured 111 MB peak against 98 MB materialised, but `db.each`'s completion callback
never fired in duckdb 1.4.4 and `load()` hung; the `stream()` async-iterator API is the one to try if
this is revisited.

## A multi-row `INSERT OR REPLACE` crashes DuckDB

A batched `INSERT OR REPLACE` compiles to a MERGE and can kill the process with `INTERNAL Error:
Unaligned fetch in validity and main column data for update` inside
`MergeIntoGlobalState::Sink -> PhysicalUpdate::Sink` — measured 2 runs in 3 on a fresh vault at some
batch shapes. `insertBatched()` (`persistence.ts:711`, used by both `saveNodes` and `saveEdges`)
avoids the MERGE entirely: it probes which ids already exist inside the open transaction, then runs a
plain `INSERT` for new rows and a single batched `UPDATE ... FROM (VALUES ...)` for existing ones —
not row-by-row, or the per-statement memory cost comes back through the other door. Rows are
deduplicated by id first (last one wins), which preserves what row-by-row `INSERT OR REPLACE` used to
do.

## The pulse's gigabyte has NO single cause — it is many stages that each add memory

`CONDUCKS_MEM_TRACE=1` traces where a pulse's memory goes (`core/utils/mem-trace.ts`, called from
`domain/analysis/orchestrator.ts`). On a 446-447 unit pulse it measured a peak above a gigabyte built
from module load, grammar init, registry init, reading all files, skeleton build, discovery flush,
parse, vault write, and reloading the whole graph for PageRank — each stage adding roughly 3-230 MB,
with the PageRank reload (`persistence.load()` pulling the whole graph back) the single largest step
at ~230 MB, directly undoing the flush-and-clear the waves just did. Nothing dominates, so no single
fix helps much, and native memory does not come back down between stages even though `heapUsed` falls
after each wave. Established as NOT the cause: the JavaScript heap (the same pulse succeeds under
`--max-old-space-size=400` and still peaks above a gigabyte) — do not re-propose it.

## `pulseId` on a node means FIRST seen, not last — so a sweep by pulseId deletes live rows

The obvious fix for stale rows is "delete anything whose pulseId is not the newest" — `persistence.ts`'s
`sweepRowsNotInPulse` (`persistence.ts:1304`, keyed on `pulseId`, comment at `persistence.ts:1157`).
It is wrong to assume every row gets re-stamped: virtual/induced nodes skip a target the reloaded
graph already holds, so they never re-stamp and keep carrying the pulse that first created them.
Before sweeping by a column, check what the column means on every row, not on the rows the sweep was
designed around — "not seen this run" is not the same thing as "not re-written this run".

## An in-process vault handle between two CLI runs fails the next writer's lock

Opening `SynapsePersistence` inside a test to read the graph takes a DuckDB lock that a subsequent
`conducks analyze` cannot acquire — the CLI then reports "[Vault Locked] Another process is WRITING
this vault", which reads as a broken FEATURE rather than a broken test, because the error names a
writer conflict the test author was not thinking about (they only read). Integration tests that
interleave CLI runs with graph reads should read THROUGH the CLI (`runCli(['query', ...])` from
`tests/integration/features/helpers.ts`) instead, or open the vault only after the last CLI
invocation. `runCli` returns `{stdout, stderr, combined, status}` — not a plain string.

## A dead parameter reads as a working switch

`save()` (`src/lib/core/persistence/persistence.ts:885`) once accepted a `metadataOnly` flag its body
never read. Two call-site comments described it as the switch that suppressed row writes, so the
obvious fix for a binder whose output had vanished was to flip it — which would have changed nothing.
`save()` writes metadata and the pulse row and has never written node or edge rows in any mode. The
parameter is gone; the comment at that line records why.

**When a comment explains WHY an option is set, check the callee actually reads it.** A dead
parameter is worse than no parameter: it sends the next reader to a fix that cannot work, and the
call site reads as evidence that it can.

## Features
none — four files (`persistence.ts`, `file-hash-gate.ts`, `freshness.ts`, the door), none of them a
capability a caller asks for by name. `FileHashGate` and `freshness` are rules the vault applies on
the way in and out, not questions anyone poses to this module.

## Glossary
- **pruneTaxonomy** — the one place allowed to decide which nodes survive a pulse; see above.
- **the vault** — the DuckDB database at `.conducks/`, opened Connect-Execute-Disconnect, one
  read-write connection at a time (CLI), read-only elsewhere (MCP).
