# 0111 — an empty result must not mean "you phrased it wrong"
Status: Accepted
- Date: 2026-08-02
- Builds: 0102, 0109, 0110
- Enforced by: measured on `reference-project/openship` — `find_usages` by bare name returns the two ground-truth call sites with lines; `--help` on any command prints its usage

## Context

Two defects seen in a subagent's transcript while it tried to use the tool, both deferred at the
time and both the same shape: **the command answered something other than the question, and gave no
sign it had.**

**`conducks query --help` printed the whole symbol inventory.** Every command's argument parser skips
unknown `--flags`, so `--help` left an empty query, and an empty query is read as `*` — the
documented inventory behaviour (ADR 0102). Asking a tool how to use it and receiving several hundred
symbols is the least useful possible answer, and it is the same for every command taking a
positional argument.

**`find_usages` returned `[]` for a symbol with two callers.** The template demanded an exact full
node id AND an exact edge type:

```sql
WHERE e.targetId = ?  AND e.type = ?
```

The CLI passes what the user typed, so `query allocateHostPort --mode template --template
find_usages` bound `targetId = 'allocateHostPort'` — an id no node has — and `type = ''`. Both
matched nothing.

`[]` here means "you phrased it wrong" and is indistinguishable from "nothing calls this". That is
the failure this project keeps returning to: a confident answer that is really an absence of one.

## Decision

**1. `--help` is handled in the DISPATCHER, before any command runs.** It prints that command's own
`description` and `usage`. In the dispatcher rather than per command, because the defect is per
command and the fix should not be written thirty-nine times.

**2. `find_usages` matches a bare NAME or a full id, and an empty `edgeType` means any reference
edge.** It also returns `lineNumber` and the edge `type`, so the answer is openable and each row
says what kind of usage it is.

That required a supporting fix: `execute()` bound a repeated parameter name by shifting the user's
argument list a second time, so a template comparing one value in two places would silently compare
two different things. A repeated name now reuses the value it already resolved to.

**3. An `ALIASES` edge carries its line.** It had none, so a re-export printed `file:0` — a position
that reads like a real one and points nowhere. The re-export is written on a line; carry it.

## Consequences

- MEASURED on openship, `find_usages` by bare name, where it previously returned `[]`:

  ```
  CALLS      deploy.service.ts:995
  CALLS      build-pipeline.ts:1265
  ALIASES    packages/adapters/src/index.ts:109
  IMPORTS    build-pipeline.ts:20
  IMPORTS    deploy.service.ts:22
  ACCESSES   packages/adapters/src/index.ts:110
  ```

  The two `CALLS` lines are exactly the hand-derived ground truth, and every row now carries a real
  line — no `:0`.
- `--help` works on every command, not only the one that exposed it.
- No regression: 5,327 nodes, dangling **6.03%**, edge precision **99.98%**, line accuracy **100%**,
  1,329 tests green.
- The `find_usages` template had been shipped, documented and whitelisted in the MCP surface without
  anyone calling it with a bare name. It is the fourth "the answer was there and the surface would
  not give it" defect in two days, after `explain`'s NaN, `--blueprint`'s `[object Object]`, and the
  dropped line columns. Worth treating as a class: **any command that can return empty should be
  checked against an input that must NOT return empty.**
