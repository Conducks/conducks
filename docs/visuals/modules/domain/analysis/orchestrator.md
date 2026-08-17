# domain/analysis/orchestrator — the pulse

**Part of:** [domain/analysis](../analysis.md). Includes `analysis/orchestrator.ts`,
`analysis/micro-pulse.ts` (single-file re-analysis for the watcher), `pipeline` (topological batching), and three collaborators split out of the orchestrator
when it reached 640 lines (todo03#P5): `graph-skeleton-builder` (the L0-L3 containment hierarchy,
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

**Deferred / not built:** analysis-pass edges are not recomputed for unchanged files. There is no
"re-run passes without re-parsing" mode, which is precisely what makes the incremental behaviour
below so easy to trip over.

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

## Atomicity and workers

The whole pulse runs inside one transaction, so a killed analyze rolls back rather than leaving a
partial graph (which historically loaded fine while being ~95% disconnected — everything looked like
an orphan). Workers are **processes, not threads** — `spawnSync` with a temp-file in/out protocol
(<span class="anchor">src/lib/domain/analysis/worker-pool.ts:27</span>). This line said "worker
threads" while the paragraph six lines above already said subprocesses, and the difference is not
pedantry: a process shares no module state, which is exactly why each one loads its own grammars
rather than inheriting the parent's.
