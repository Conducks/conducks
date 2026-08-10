# 0148 — every MCP tool is a CLI command, and where both exist they mirror
Status: Accepted
- Builds: 0005, 0119
- Date: 2026-08-10
- Enforced by: tests/architecture/paired-surfaces.test.ts (every paired capability must reach a shared `registry.*` accessor; the one granted exception names a reason and a todo), tests/unit/interfaces/cli/commands/impact-direction.test.ts, tests/unit/interfaces/cli/commands/trace-mode.test.ts, tests/unit/interfaces/cli/commands/prune-filter.test.ts, tests/unit/interfaces/tools/rename-dry-run-default.test.ts

## Context

Twelve capabilities exist on both surfaces — `conducks diff` and `conducks_diff`, `conducks prune` and
`conducks_prune`, and ten more. Nothing said what the relationship between them was, so they drifted,
and the drift was never a compile error or a test failure. It was measured on 2026-08-09/10:

- `conducks_diff` reported 0 impacted symbols while the CLI reported 7, on the same tree at the same
  moment — the tool held a private copy of the engine that had received neither of the CLI's two fixes
  (ADR 0147's session, todo58).
- The docs denominator was hand-written in two CLI commands and absent from the tool, so a project
  with no `docs/` read as healthy from MCP and correctly as "nothing checked" from the CLI (todo53).
- `conducks_rename` WROTE TO DISK when `dryRun` was omitted, while the CLI defaulted to a dry run. Two
  surfaces, opposite defaults, on the only destructive operation.
- `trace`'s `path` mode, `prune`'s type filter and `flows`' thresholds existed on the tool and were
  unreachable from the CLI at all.

Each was found by hand, at a cost of hours, and each had been live for some unknown stretch.

## Decision

**Every MCP tool is a CLI command. Not every CLI command is an MCP tool. Where both exist they
mirror: the same input produces the same ANSWER, differing only in rendering.**

The rule is one-directional on purpose. `mirror`, `setup`, `install-hooks` and the rest have no agent
audience and stay CLI-only; adding tools for them would be surface for its own sake. But an agent must
never be able to ask something a person cannot, because the CLI is where a person checks what the
agent did.

"Mirror" is about the ANSWER, not the shape of the argument parser. `--json` is the honest comparison
point — it is the CLI's machine surface, and it should carry the same data the tool returns. Rendering
differs by design: `context` returns source lines on the CLI and a token budget on the tool.

**Capability, not parameter list.** Comparing `inputSchema` properties against `usage` strings reported
`audit` as missing four modes; comparing what a user can ASK showed every one already had a CLI home
under a different command name (`advice` is `conducks advise`, `guard` is `conducks guard`). One
surface groups five things under one tool while the other spreads them across three commands, and that
is not drift. State a gap as a question a user cannot ask.

## Consequences

- Closed on 2026-08-10: `trace` gained `--mode`/`--target`, `prune` gained `--type`/`--limit`, `flows`
  gained `--min-members`/`--limit`, `coverage` gained `--limit`, and `impact`'s CLI stopped silently
  reading an unknown direction as upstream. Each verified against a foreign codebase rather than
  asserted — `prune --type ORPHAN` returns 17 from both surfaces, `flows --min-members 2/5/10` returns
  1126/635/376 from both.
- `conducks_rename` is a dry run unless told otherwise. Its schema had always said so; a JSON Schema
  `default` is documentation and the server does not inject it, so `undefined` reached a parameter
  defaulted to `false` one layer down.
- The gate is deliberately WEAK: one shared `registry.*` accessor. A call-graph version would be
  stronger and would fail on legitimate presentation differences, so it would be argued with and then
  switched off. Every defect above violates the weak form.
- `context` is granted an exception with a reason and a todo. It is not drift but two different
  features under one name — a directional flow trace with source lines against a scored BFS with a
  token budget (ADR 0103). Unifying it means extracting the BFS into the domain, which is a three-layer
  change, and adding `--radius` to the CLI's algorithm would produce a flag that reads as obeyed and
  does nothing.
- Still open, and named rather than assumed: `status` speaks a different mode vocabulary on each side,
  and `diff` has pulse-compare on the CLI and `drift` on the tool with neither holding the other's.
  todo61 carries both.
