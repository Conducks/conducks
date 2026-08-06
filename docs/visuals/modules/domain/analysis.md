# domain/analysis — establishing what is true about the code

**Layer:** domain. Imports core + contracts.

**Responsibility:** everything that turns source into knowledge — reflecting files, sequencing a
pulse, answering structural queries, and the feature-shaped analyses that sit on top (coverage, the
docs grammar).

**Boundaries:** this module decides what is **true**, never what is **acceptable**. No thresholds, no
violations, no severity — [governance](governance.md) owns judgement. The split matters:
the same cycle data serves an audit, an advisor and a guard with three different opinions applied on
top.

**Deferred / not built:** a query planner. `query-service` answers a fixed set of questions with
hand-written SQL and graph walks; there is no general query language.
Adequate while the question set is known.

## Parts

- **[reflector/](../core/parsing/reflector.md)** — file → spectrum. The single most load-bearing unit here.
- **[orchestrator/](analysis/orchestrator.md)** — the multi-pass pulse, incremental analysis, workers.
- **[coverage/](analysis/coverage.md)** — binding an external coverage report onto the graph.
- **[docs-grammar/](analysis/docs-grammar.md)** — the conducks-docs standard, enforced.

`conducks-core` is the façade the registry wires; `query-service` answers structural questions;
`fallback-detector` reports where analysis degraded; `gateway-service` is the live vault-watch feed
behind the Mirror dashboard, constructed by the `mirror` CLI command and consumed by the web server.

## Why the split between the parts is where it is

One pass cannot resolve a cross-file reference, because the target may not be parsed yet. That single
constraint is what divides this module: the [reflector](../core/parsing/reflector.md) sees exactly one file and
seeds unresolved specifiers, the [orchestrator](analysis/orchestrator.md) is the only thing allowed to
see all files and is therefore where real edges get built, and the feature analyses
([coverage](analysis/coverage.md), [docs-grammar](analysis/docs-grammar.md)) read the finished graph and
never touch parsing. Anything that needs repo-wide knowledge moves up, never sideways.

The consequence every part inherits — `analyze` is incremental, so a re-run can show no change while
your new logic never executed — is spelled out once, in the orchestrator's doc. Read it before
believing any number produced from this module.
