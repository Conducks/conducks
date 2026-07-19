# conducks — docs

Structural intelligence engine: analyze a codebase into a queryable graph, then answer structural
questions live (audit, impact, trace, coverage). Docs here hold **authored intent only** — for
structure, query the graph, never a file.

Follows the **conducks-docs** standard.

- **features.md** — what each command/capability is FOR and why (authored intent).
- **conventions.md** — binding rules with reasons.
- **memory.md** — gotchas the code can't show.
- **progress.md** — dated log of what shipped.
- **handover.md** — dated snapshot for the next session.
- **decisions/** — ADRs (one immutable file per decision, indexed in `decisions/README.md`).
- **todos/** — numbered todos; `completed/` = done.
- **architecture/** — authored per-module intent (`MODULE.md`), if/when a module's shape needs
  explaining. Free-form, never auto-generated (ADR 0015). None yet — add on demand.

Soft docs (`business/`, `brand/`, `product/`, `design/`) hold project-specific material.

Want structure? `conducks audit` · `conducks impact <sym>` · `conducks trace <sym>` · `conducks coverage`.
