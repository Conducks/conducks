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

**Uses:** [core/parsing](../core/parsing.md)'s reflector for one file's spectrum, [core/graph](../core/graph.md)
for the in-memory adjacency list the pulse builds into, and [core/persistence](../core/persistence.md)
to write nodes, edges and kinetic columns atomically per pulse. Everything downstream —
[governance](governance.md), [evolution](evolution.md), [coverage](coverage.md), [docs](docs.md) — reads
the graph this module produces and never re-derives it.

**Deferred / not built:** a query planner. `query-service` answers a fixed set of questions with
hand-written SQL and graph walks; there is no general query language.
Adequate while the question set is known.

## Features

- **Full structural pulse** (`conducks analyze`) — the orchestrator's multi-pass discovery, induction
  and resolution wave, described in [orchestrator](analysis/orchestrator.md).
- **Incremental re-analysis** — `project-monitor`, `change-set`, `module-hash` and `micro-pulse` decide
  which files actually need re-parsing on a repeat run; see the orchestrator note for what this hides
  when it goes wrong.
- **Structural queries** (`conducks query`) — `query-service` answers a fixed set of questions
  (symbol lookup, listing, entry-point detection) with hand-written SQL and graph walks, not a general
  query language.
- **Live watch feed** — the vault-watch stream behind the Mirror dashboard. It is NOT in this module
  any more: `gateway-service.ts` became `src/lib/domain/mirror/gateway.ts` behind its own door (ADR
  0190). Listed here because this note claimed it for longer than it was true — see
  [interfaces/web](../interfaces/web.md).

A finding is scored by what was found WRONG, not by how many findings a pass produced — a headline
count without that check rewards a louder tool over a more correct one. Applied concretely in
[evolution](evolution.md)'s prune precision, which is audited both directions rather than by volume.

## Glossary

- **Pulse** — one full or incremental run of `analyze`: skeleton build, discovery, induction, link,
  resolution, in one atomic transaction.
- **Reflection** — turning one file's parse tree into a spectrum of unresolved nodes and edges (owned
  by the reflector, not this module).
- **Induction** — materialising a node for a reference that pointed outside the files seen so far.

## Traps

**`query`'s template library advertised entries it then refused, and a missing identifier answered
zero rows instead of refusing.** `mode:"template"` with no name lists the Oracle library in full; it
used to include `type_coupling` while a separately hand-typed allowlist beside it omitted that same
entry, so calling it answered `UNKNOWN_TEMPLATE` with a suggestion to "list available templates" — the
list that had just advertised it (todo53#P1). Fixed: the allowlist is now ASKED of the library
(`listTemplates()`, `src/lib/domain/analysis/query-service.ts:559`) rather than retyped, so it cannot
go stale in either direction. Separately, `execute()` used to resolve a missing template param to
`PARAM_DEFAULTS[p] ?? ''`, so an identifier param like `symbolId` with no value ran `WHERE
e.targetId = ''`, matched nothing, and reported `nodeCount: 0` — "nothing breaks" for a question that
named no symbol (todo54#P1, ADR 0145). `REQUIRED_PARAMS` (`query-service.ts:47`) now lists every
identifier param that has no meaningful empty value and refuses rather than silently answering zero
rows; params whose SQL treats an empty string as "any" (`edgeType`, `canonicalKind`, `namespaceId`,
`query` itself, for unscoped fuzzy search) are deliberately excluded — the distinction is read out of
each template's SQL, never inferred from the defaults table.

## Parts

- **[reflector/](../core/parsing/reflector.md)** — file → spectrum. The single most load-bearing unit here.
- **[orchestrator/](analysis/orchestrator.md)** — the multi-pass pulse, incremental analysis, workers.

`coverage` and `docs` are no longer parts of this module — they are their own areas,
[coverage](coverage.md) and [docs](docs.md), split out in the ADR 0150 campaign because each has its
own door. The link here pointed at the old path under `analysis/` for some time after the move and resolved
to nothing: `visuals-lint` checks that every code ANCHOR resolves and does not follow markdown links
between notes, so a dead link between pages is invisible to it.

`conducks-core` is the façade the registry wires; `query-service` answers structural questions.
`project-monitor`, `change-set`, `module-hash` and `micro-pulse` carry the incremental path;
`graph-skeleton-builder`, `reflection-pipeline` and `worker-pool` the pulse itself, with
`filter-builder` shared by the query paths. Twelve files, and the gateway is no longer one of them.

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
([coverage](coverage.md), [docs-grammar](docs/docs-grammar.md)) read the finished graph and
never touch parsing. Anything that needs repo-wide knowledge moves up, never sideways.

The consequence every part inherits — `analyze` is incremental, so a re-run can show no change while
your new logic never executed — is spelled out once, in the orchestrator's doc. Read it before
believing any number produced from this module.
