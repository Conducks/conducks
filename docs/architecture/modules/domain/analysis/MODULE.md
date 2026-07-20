# domain/analysis — establishing what is true about the code

**Layer:** domain. Imports core + contracts.

**Responsibility:** everything that turns source into knowledge — reflecting files, sequencing a
pulse, answering structural queries, and the feature-shaped analyses that sit on top (coverage, the
docs grammar).

**Boundaries:** this module decides what is **true**, never what is **acceptable**. No thresholds, no
violations, no severity — [governance](../governance/MODULE.md) owns judgement. The split matters:
the same cycle data serves an audit, an advisor and a guard with three different opinions applied on
top.

**Deferred / not built:** a query planner. `query-service` answers a fixed set of questions with
hand-written SQL and graph walks; there is no general query language beyond the small GQL parser.
Adequate while the question set is known.

## Parts

- **[reflector/](reflector/MODULE.md)** — file → spectrum. The single most load-bearing unit here.
- **[orchestrator/](orchestrator/MODULE.md)** — the multi-pass pulse, incremental analysis, workers.
- **[coverage/](coverage/MODULE.md)** — binding an external coverage report onto the graph.
- **[docs-grammar/](docs-grammar/MODULE.md)** — the conducks-docs standard, enforced.

`conducks-core` is the façade the registry wires; `query-service` answers structural questions;
`fallback-detector` reports where analysis degraded.

## Why analysis is multi-pass

A single pass cannot resolve a cross-file reference, because the target may not be parsed yet.
Discovery registers symbols, induction reflects each file, and a final pass resolves imports and
binds bare names. That is why the reflector only seeds a raw specifier and the orchestrator builds
the actual IMPORTS edges.

The consequence that bites everyone: **`analyze` is incremental — unchanged files are skipped
entirely**, so edges from an analysis pass do not regenerate for a file that has not changed. After
editing anything in this module, verify with `conducks clean` + a fresh `analyze`. A stale graph
produces numbers that look completely real; a half-fixed one produces numbers that are plausible and
wrong.
