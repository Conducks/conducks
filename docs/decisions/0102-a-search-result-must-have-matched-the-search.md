# 0102 — a search result must have matched the search
Status: Accepted
- Date: 2026-08-02
- Builds: 0095, 0101
- Enforced by: tests/integration/features/query-command.test.ts (--limit honoured in both directions; a term equal to a flag value is searched for rather than deleted; an echo neither displaces nor impersonates a direct match; plus the cases that already passed, so a fix cannot break them)

## Context

The second command to be measured the way `analyze` was. Twelve cases were derived by READING
`query.ts`, `intelligence/index.ts` and `search-engine.ts`, and written to
`CONDUCKS/oracle/EXPECTED-QUERY.md` **before the command was run once**. Eight passed. Four failed,
and all four had been predicted from the source.

| id | expected | got |
|---|---|---|
| Q06 | `query '*' --limit 3` → 3 rows | 10 |
| Q07 | `query '*' --limit 50` → >10 rows | 10 |
| Q11 | every result contains the term searched for | 6 of 10 rows were `action1`..`action6` |
| Q12 | `query fuzzy` → 0 rows (no such symbol) | 10 — the entire inventory |

Three distinct causes:

1. **`--limit` was parsed and never passed.** `query.ts` read it into a local and then called
   `registry.query.query(query || '*')` with one argument, so every fuzzy search returned
   `IntelligenceService.query`'s default of 10.
2. **The argument parser deleted search terms by value.** It filtered tokens with
   `a !== mode && a !== templateId && a !== filterJson && a !== String(limit)`. `mode` defaults to
   `'fuzzy'`, so `conducks query fuzzy` deleted its own query, and an empty query is read as `*` —
   asking for a symbol named `fuzzy` returned everything. `query 10` failed the same way against the
   default limit.
3. **Echo results were indistinguishable from matches.** `propagateWavefront` gives every caller 50%
   of a matching node's score, three hops deep, and those ids go into the same result map. On the
   fixture, `query logAudit` spent six of its ten slots on the six callers — none of which contain
   the string searched for, none of which were marked as anything but a result.

The third is the one that matters. The first two make the command ignore a flag; the third makes it
**answer a question that was not asked, while pushing out the answer to the one that was**.

## Decision

**A result claiming to be a match must have matched. An echo is kept, labelled, and never promoted.**

- Pass `limit` through to the search.
- Parse arguments **by position**: skip each known flag and the token after it. A search term is
  whatever is left, whatever it happens to spell.
- Track direct matches in their own set. Order direct matches ahead of every echo regardless of
  score, then fill remaining slots with echoes. Tag each node `matchType: 'direct' | 'echo'`, and
  surface it — a `match` field in `--json`, an `echo` column in the table.

The echo is worth keeping rather than deleting: the callers of the thing you searched for are
usually what you want next, which is why it was built. What was wrong was the presentation, not the
idea. An echo's energy is derived from a match rather than earned, so the two must not compete on
one number.

Rejected: (a) remove wavefront propagation — it throws away a genuinely useful second ring to fix a
labelling problem; (b) keep one ranked list and simply document that some rows are neighbours —
documentation cannot make two identical rows distinguishable at the point of use.

## Consequences

- The oracle score goes **8/12 → 12/12**. `--limit 3` gives 3, `--limit 50` gives 50, `query fuzzy`
  gives 0, and every `direct` row for `query logAudit` contains `logaudit` while the six callers are
  present and labelled `echo`.
- The regression test was **run against the unfixed build first and failed 3 of 5**. A test written
  after a fix and never seen to fail proves the fix compiles.
- **One prediction was wrong, and in the useful direction.** Q10 expected `properties.rank` to be
  undefined on a shallow load — `persistence.ts` says plainly that the blob-only fields have "no
  reader on this path" — which would have made the Kinetic Gravity Multiplier a constant 1. It is
  recomputed live by `StructuralRanker.calculateGravity` at graph load. Reading the persistence
  layer was not enough, because the value has a second source. Recorded because the method is only
  worth trusting if its misses are recorded too.
- The `--limit` and argument-parser defects are the kind a type system cannot see: both were
  well-typed, and both silently produced a plausible answer. That is the same class as the wrong
  ranks in ADR 0099 — a wrong value that reads exactly like a right one.
- `template` and `filter` mode are still UNMEASURED. This ADR covers fuzzy mode, which is what a bare
  `conducks query <name>` uses. Stated rather than implied, so the score is not read as covering the
  whole command.
