# domain/analysis/orchestrator — the pulse

**Layer:** domain (part of `domain/analysis`).

**Part of:** [domain/analysis](../analysis.md). Includes `analysis/orchestrator.ts`,
`analysis/micro-pulse.ts` (single-file re-analysis for the watcher), `pipeline` (topological batching), and three collaborators split out of the orchestrator
when it reached 640 lines (todo03#P5; it is 350 lines today): `graph-skeleton-builder` (the L0-L3 containment hierarchy,
built before any file is parsed), `worker-pool` (dispatch to spawned subprocesses, or the main-thread
fallback when `CONDUCKS_WORKERS=0`), and `reflection-pipeline` (one file's spectrum becoming edges:
self-import, external boundary, cross-file, per-binding).

The wave loop stayed in `orchestrator.ts` deliberately. Chunking, flush, kinetic-column writes, the
circuit breaker and the final metadata sync thread shared counters through ONE atomic pulse, so
splitting them would move the same code behind a parameter list of equal size without reducing
coupling. Sequencing a full analysis is what this module is FOR; it is not a separable collaborator.

**Responsibility:** sequencing a full analysis. It builds the ecosystem → repository → directory
skeleton, runs discovery and induction waves across worker PROCESSES, and owns the final resolution
pass where imports become real edges.

**Boundaries:** it coordinates; it does not parse (that is the reflector) and it does not judge (that
is governance). It is, however, the only place that may reason about *all* files at once.

**Uses:** the reflector (`core/parsing`) for each file's spectrum, `core/graph`'s adjacency list to hold
the graph while it is built, and `core/persistence` to commit the whole pulse — nodes, edges and
kinetic columns — inside one transaction. Reports its wave counts back to the CLI/MCP surface through
[domain/analysis](../analysis.md)'s facade; nothing outside this module walks the pulse directly.

**Deferred / not built:** analysis-pass edges are not recomputed for unchanged files. There is no
"re-run passes without re-parsing" mode, which is precisely what makes the incremental behaviour
below so easy to trip over.

## Features

- **Skeleton build** — the ecosystem → repository → directory containment hierarchy, built before any
  file is parsed (`graph-skeleton-builder`).
- **Discovery and induction waves** — dispatched across worker PROCESSES (`worker-pool`), or the
  main-thread fallback when `CONDUCKS_WORKERS=0`.
- **Import resolution** — the only place a raw specifier becomes a real `NEURAL::`/`BIND::` edge, once
  `allPaths` is known; external imports become a durable `ECOSYSTEM::` boundary node plus a `DEPENDS_ON`
  edge instead (ADR 0014).

## Glossary

- **Wave** — one pass of the orchestrator's loop over the file set (discovery, induction, or link).
  **Not the wave [interfaces/web](../../interfaces/web.md) means** — that one is the dashboard's
  payload. Same word, unrelated things; `conducks glossary` reports the pair on purpose.
- **NEURAL:: edge** — the file-level cross-file reference edge, emitted once a specifier resolves.
- **ECOSYSTEM:: node** — a durable boundary node standing in for an import that resolved outside the
  project.

## Incremental analysis is the single biggest source of wrong conclusions

**Unchanged files are skipped entirely.** Edges produced by an analysis pass — cross-file imports,
the `self::` marker, System 2 origin tags — do not regenerate for a file that has not changed. After
editing a linker, a processor or this file, a re-run can legitimately show **no change at all** while
your new logic never executed.

The rule: verify graph-shape work with `conducks clean` + a fresh `analyze`. A stale graph produces
numbers that look completely real. A partially-fixed state is worse — it produces numbers that are
plausible *and* wrong, which has already caused one incorrect recommendation to be published and
retracted.

`analyze --force` re-ingests nodes but does **not** purge orphaned cross-file edges from prior
pulses; `clean` does, via `persistence.clear()`.

## Why imports are built here and not in the reflector

A cross-file reference cannot be resolved while parsing, because the target may not be parsed yet.
The reflector seeds a raw specifier; this pass resolves it once `allPaths` is known and emits both the
file-level `NEURAL::` edge and the per-binding `BIND::` edges that make function-level dead-code and
type-only classification possible.

External imports never resolve to an in-repo node. They emit a durable `ECOSYSTEM::` boundary node
plus a `DEPENDS_ON` edge tagged with origin and package — without that, the entire dependency surface
was invisible during streaming (ADR 0014).

## The worker pool never spawns a worker in the shipped binary

`WorkerPool.run()` looks like a parallel fan-out and is not one for any installed copy. `isTs =
__filename.endsWith('.ts')` (`worker-pool.ts:16`) is false under compiled JS, so the tsx loader is
never resolved and `skipWorker` is always true — the `spawnSync` fan-out only runs under `tsx`, which
is development. `CONDUCKS_WORKERS=0` and the default land within 10 ms of each other across four runs,
and a full `analyze --force` holds ~14% CPU on a multi-core machine, which is how this was proven
rather than assumed from reading the branch. `workerPool.run` is still 274 ms of the 423 ms
`orchestrator.analyze` costs on a 5-unit pulse — the parse IS the cost, it is just not parallel. Even
where the fan-out does run (under `tsx`) it is sequential: each chunk blocks on `spawnSync` until that
process exits.

## The graph is loaded twice per analyze, and the first load is thrown away

The bootstrapper loads the whole graph at startup (measured 88 MB → 223 MB, +135 MB), and
`AnalysisDomain.analyze` then calls `this.graph.getGraph().clear()` before using any of it — the pulse
reloads from the vault anyway. ADR 0038 made the load lazy for read-only paths; `analyze` still boots
eager. Booting it lazily should return that 135 MB outright; not yet done, because the deferred-graph
guard throws on any access and every pre-pulse path would need checking first.

## Atomicity and workers

The whole pulse runs inside one transaction, so a killed analyze rolls back rather than leaving a
partial graph (which historically loaded fine while being ~95% disconnected — everything looked like
an orphan). Workers are **processes, not threads** — `spawnSync` with a temp-file in/out protocol
(<span class="anchor">src/lib/domain/analysis/worker-pool.ts:27</span>). This line said "worker
threads" while the paragraph six lines above already said subprocesses, and the difference is not
pedantry: a process shares no module state, which is exactly why each one loads its own grammars
rather than inheriting the parent's.
