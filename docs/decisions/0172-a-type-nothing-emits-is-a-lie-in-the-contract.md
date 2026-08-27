# 0172 — a type nothing emits is a lie in the contract
Status: Accepted
- Date: 2026-08-27
- Builds: 0169
- Enforced by: tests/unit/interfaces/tools/mcp-prune-types.test.ts

## Context

`DEAD_CODE_TYPES` declared six finding types. `dead-code.ts` mentions five of them. Measured:
`grep -c UNREACHABLE_LOGIC src/lib/domain/evolution/dead-code.ts` returns **0** — nothing has ever
produced one.

It was carried the whole way regardless: through the MCP tool's filter enum, through the CLI's
summary breakdown, and through the guard test that restates the list by hand. Every subject reported
`UNREACHABLE_LOGIC: 0`, on every run of this benchmark.

That zero is the problem. It reads as **"this codebase has no unreachable logic"** when it means
**"this check does not exist"**. A caller filtering `type: "UNREACHABLE_LOGIC"` gets an empty list
and no indication the filter is inert.

## Decision

**Remove it.** A tool advertises what it can produce.

The alternative — implementing dead-branch detection — is a feature nobody asked for, in an analyzer
whose whole discipline is that a verdict must be defensible. Reachability *within a function body* is
a different analysis from reachability *across a graph*, and inventing it to justify a name already
in a list is the wrong order.

## Consequences

- Findings are unchanged on all three subjects — scraper 49, sofie 172, orchestrator 245 — which is
  the proof the type was inert rather than merely rare.
- The guard test lost its `UNREACHABLE_LOGIC` bucket assertion and gained an `ONLY_IMPORTED` one. The
  bucket claim was never about that type specifically: it exists because todo53 found the MCP tool
  dropping types from its summary, so what must be asserted is that **the QUESTION types have
  buckets** — a question a caller cannot filter for is a finding that exists nowhere.
- `PRUNE_TYPES` is derived from `DEAD_CODE_TYPES` rather than retyped, so removing a type also
  removed its filter value. That derivation was added to stop a type being ADDED silently; it turns
  out to carry a removal just as well.
- **The general point.** The list was restated by hand in the guard test ON PURPOSE, and that is what
  made this removal land somewhere visible. A hand-restated list is usually a smell; here it is the
  gate, and it earned its place in both directions.
