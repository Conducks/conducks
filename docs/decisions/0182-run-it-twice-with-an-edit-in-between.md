# 0182 — run it twice, with an edit in between
Status: Accepted
- Date: 2026-08-27
- Builds: 0107, 0181
- Enforced by: tools/benchmark/oracle-incremental.mjs

## Context

`analyze` is incremental by mtime — a file untouched since the last pulse is not re-parsed. That is
why the tool is usable on a large repository, and it carries an invariant nothing checked: **the graph
after an incremental pulse must equal the graph after a cold one.**

The failure mode is the worst available. An incremental graph missing edges answers every question
CONFIDENTLY and slightly wrongly, and nothing downstream can tell: `prune` calls a symbol dead because
its caller was not re-parsed, `impact` reports a smaller blast radius, `trace` stops early. ADR 0107
records exactly this — import specifiers were resolved against the DIRTY set, so the file being
imported FROM was absent and the edge was never built.

It is also the defect a suite structurally cannot see. **Every test analyzes once, from empty**, so
every test runs the cold path. ADR 0107 stated the lesson in one line — *run it twice, with an edit in
between* — and nothing was doing it.

The `list.md` entry carried "incremental ≠ cold on multi-wave projects (~25 nodes)" as a standing open
defect. It does not reproduce.

## Decision

**Four waves, each analyzed cold, then edited and analyzed incrementally, then analyzed cold again and
compared.**

The reference is the cold pulse, because it re-reads everything. The oracle is conducks in its other
mode rather than an independent parser, and deliberately so: the question is not *is the graph right*
— that is what ADRs 0180 and 0181 score — but *does one mode agree with the other*. A disagreement is
a defect whichever side is wrong.

The shapes are the ones ADR 0107 named: a new file importing an existing one, an existing file gaining
a call into another, the same wave in Python, and **three consecutive waves with external
scaffolding** — because the recorded defect names multi-wave projects, and a single edit is not that
shape.

## Consequences

- All four agree, node for node and edge for edge: 19/27, 19/24, 21/29 and 32/43. **The standing open
  defect does not reproduce**, and it is now guarded rather than merely absent.
- **Proved by recreating ADR 0107's actual defect.** Narrowing `allDiscoveredPaths` back to
  `dirtyFiles` fails **all four** waves with the precise symptom the record describes — missing
  `IMPORTS` edges from `main.ts::unit`, and Python `CALLS` edges landing on a dangling `pkg.lib::helper`
  that the cold graph does not contain.
- 6 seconds, so it belongs in `npm run gate` rather than in a nightly.

**What is now checked about the base.** Nodes exist for every declaration (0180), every `CALLS` edge
points at text that is really there (0181), and the incremental path produces the same graph as the
cold one (this). What is still unchecked is edge RECALL — a call in source with no edge at all is
invisible to all three.
