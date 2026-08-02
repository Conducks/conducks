# 0104 — a dangling edge cannot claim it resolved, and an unwired module is a question
Status: Accepted
- Date: 2026-08-02
- Builds: 0085, 0096, 0026, 0028
- Enforced by: tests/unit/domain/evolution/unimported-module-question.test.ts (an inert unimported file yields a verdict; a wired unimported file yields a question; the question names the decision) — plus the oracle fixture, T02 and T16/T28

## Context

Two findings the oracle had recorded and neither had been closed.

### T02 — a confident edge pointing at nothing

`makeCache()` declares no return type, so `cache.get('k')` cannot be resolved and must dangle. It
did dangle — **at confidence 0.85**, which claims the opposite.

`CallProcessor` stamps 0.85 whenever it resolved the RECEIVER's file. That says nothing about
whether the file declares the member, and it cannot: whether a reference resolved is only knowable
once the whole graph exists. So the edge read as a fact.

Worse, `sweepUnresolvedGuesses` filtered on `WHERE ... AND e.confidence < 0.6`, so the sweep was
**blind to exactly the edges that lie hardest**. A dangler at 0.85 was neither examined for deletion
nor corrected. This is ADR 0085's defect returning in a narrower form — there, `WHERE confidence <
0.6` returned zero rows on a graph where half the edges dangled.

### T16 vs T28 — a verdict where a question belonged

`memory.md` records the rule: *"an unreferenced module is a question, not a finding"*, because
*disconnected by accident* and *deliberately not wired yet* are the same zero-incoming-edges shape,
and deleting the second destroys a capability nobody decided to drop. `prune` reported
`orphan-module.ts` as a confident `[ORPHAN]` anyway. The previous run left this OPEN, saying which
side is right "needs a human, not another rule."

The first fix here made every symbol in an unimported file a question — and **broke T16**, which
requires `unused.ts::neverImported` to be reported as dead. Both files are equally unimported, so
"nothing imports this file" cannot be the whole rule.

## Decision

**1. An edge whose target does not exist did not resolve.** `sweepUnresolvedGuesses` now examines
the entire dangling population rather than only the already-low-confidence part, applies the same
cause-based deletion rules to all of it, and re-stamps every survivor to `UNRESOLVED_CONFIDENCE`
(0.4). The count is printed each pulse, because a silent re-stamp is still a mutation.

The invariant this buys: **no dangling edge anywhere in the vault carries confidence ≥ 0.6.** That
is what makes `WHERE confidence < 0.6` mean something again.

**2. An INERT file is dead; a WIRED one is a question.** The line is not "nothing imports this file"
— it is whether the file contains any reference relationship at all:

| file | imported? | any reference inside? | verdict |
|---|---|---|---|
| `unused.ts` — one exported leaf | no | **no** | `ORPHAN` — a finding |
| `orphan-module.ts` — `second` calls `helper` | no | **yes** | `UNIMPORTED_MODULE` — a question |
| `caller1.ts` — `action1` calls `logAudit` | no | yes | `UNIMPORTED_MODULE` |
| any symbol in an imported file | yes | — | unchanged |

A file whose symbols participate in no reference whatsoever **cannot** be a capability awaiting
wiring, because nothing inside it is wired either. That argument holds without reference to the
fixture, which is the test of whether a rule is a rule or an overfit.

`UNIMPORTED_MODULE` is a distinct finding type, printed under its own heading — *"Questions — not
findings, and not safe to delete on this evidence"* — and it names the decision the reader must make.

Rejected: (a) downgrade dangling edges at emission time — resolution is not knowable then, which is
the whole point; (b) treat every unimported file as a question — measured, it swallowed T16's
genuine dead code; (c) leave T28 open for a human — the human decision was *which* rule, and the
inert/wired split answers it without deciding what `prune` is for.

## Consequences

- **Oracle precision on the fixture: 99.30% → 100.00%**, 0 wrong. The remaining "wrong" was a
  checker fault, not a graph fault (below).
- Section C is complete: T16 verdict, T28 question, T17 and T29 still correctly silent, T27's six
  callers now questions — correct for a fixture where nothing imports them, and they would return to
  findings in a service whose router imports them.
- The regression test was **run against the unfixed build first and failed 2 of 3**.
- `UNRESOLVED_CONFIDENCE` is now one exported constant rather than a `0.4` literal in two files.
- **`verify-edges.mjs` was wrong, not the graph** — again. It reported `useAmbiguous → validate` as
  contradicted by source, because the rename lives in the BARREL (`export { validate as
  validateEmail }`) and the checker only looked for renames in the calling file. It now indexes
  re-export aliases across the project first. That is the ninth instrument correction this session,
  against a much smaller number of real defects found by those instruments — the ratio is the point.
- The earlier claim that oracle section A stood at 11/14 was quoted from a stale `RESULTS-01.md`,
  the same file this work had just finished arguing should not be quoted. **Measured: 14/14** — every
  resolution trap lands on its expected target, including barrel rename, wildcard re-export,
  destructured dynamic import, property chain, getter chain and interface member.
