# domain/analysis — establishing what is true about the code

**Layer:** domain. Imports core + contracts.

**Responsibility:** everything that turns source into knowledge (`domain/analysis/index.ts` is the
facade) — reflecting files, sequencing a
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
- **[docs-grammar/](docs/docs-grammar.md)** — the conducks-docs standard, enforced.

`conducks-core` is the façade the registry wires; `query-service` answers structural questions;
`fallback-detector` reports where analysis degraded; `gateway-service` is the live vault-watch feed
behind the Mirror dashboard, constructed by the `mirror` CLI command and consumed by the web server.

## The pulse links, inducts, then links AGAIN

The order inside `analyze` matters and is not obvious. `IntraLinker` runs once the whole graph is in
memory, then virtual/external induction materialises nodes for references that pointed outside the
project, then the linker runs a SECOND time against those new nodes.

Without that second pass the first analyze on a fresh vault resolves fewer references than a rebuild
of the same code — the induced nodes did not exist when linking happened, and on a warm vault they
only appear to work because they survived from the previous pulse. Measured on subject-c: 7,531
resolutions cold against 7,994 warm, dangling 3,440 against 3,146 (todo59).

Not a reorder — induction READS the dangling set that linking produces, so inducting first would
starve it.

## Why the split between the parts is where it is

One pass cannot resolve a cross-file reference, because the target may not be parsed yet. That single
constraint is what divides this module: the [reflector](../core/parsing/reflector.md) sees exactly one file and
seeds unresolved specifiers, the [orchestrator](analysis/orchestrator.md) is the only thing allowed to
see all files and is therefore where real edges get built, and the feature analyses
([coverage](analysis/coverage.md), [docs-grammar](docs/docs-grammar.md)) read the finished graph and
never touch parsing. Anything that needs repo-wide knowledge moves up, never sideways.

The consequence every part inherits — `analyze` is incremental, so a re-run can show no change while
your new logic never executed — is spelled out once, in the orchestrator's doc. Read it before
believing any number produced from this module.
