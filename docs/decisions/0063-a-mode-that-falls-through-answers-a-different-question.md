# 0063 — a mode that falls through answers a different question
Status: Accepted
- Enforced by: tests/unit/interfaces/tools/mcp-surface.test.ts
- Date: 2026-07-31

## Context

All 14 MCP tools were exercised on 2026-07-31 against a freshly spawned server (todo28). Two of the
findings were the same failure in different shapes.

`conducks_status --mode manifest` returned the `health` payload byte for byte. The enum accepted
`manifest`, the description promised "an LLM-optimized technical summary of the codebase", and the
handler branched only on `map` and `pulse` — anything else, including `manifest`, fell through to the
`health` return. Same class as ADR 0044's `STABLE` reported from a comparison that never ran: a
declared capability that is absent, failing toward a plausible-looking answer instead of an error.

`conducks_coverage` had no `limit` and no token budget, unlike every sibling tool that returns a list
(`query`, `prune`, `flows` all cap; `context` has `max_tokens`). On this repository it returned
213,106 characters / 680 functions, measured via a fresh stdio JSON-RPC call against `build/`
(`node build/src/interfaces/cli/index.js mcp`, `conducks_coverage` against `coverage/coverage-final.json`)
— a response the MCP transport this todo was written against rejected outright. Worse, it reported
`meta.truncated: false` on that response. The field was not merely unhelpful, it was false: the
answer WAS cut off, by the transport rather than by the tool.

## Decision

**`manifest` is implemented, not removed.** The alternative the todo posed — drop it from the enum
and the description — was rejected because a real, cheap implementation was reachable without new
domain code: `registry.audit.audit()`, `registry.analyze.query.execute('hotspots'|'entry_points', …)`
and `status.stats`/`status.staleness` are already composed by `conducks_audit`, `conducks_status
--mode map` and `conducks_status --mode health` respectively, each already exercised in this same
file. `manifest` composes exactly those three into one onboarding digest — hotspots, entry points, a
violations summary, and the stats/staleness `health` already carries — rather than inventing a fourth
thing nobody asked for. This costs one behavioural change: `manifest` now loads the in-memory graph
(`audit()` walks it for cycle detection), where `health` and `map` deliberately do not — so
`ensureAnchor`'s `needsGraph` argument now reads `mode === "pulse" || mode === "manifest"` instead of
`mode === "pulse"` alone. That is the same cost `conducks_audit` already pays for the same reason; a
tool promising a "technical summary" that must not touch the graph would not be a technical summary.

**Not chosen: removing `manifest` from the enum.** This was the more surgical option per the todo,
and it was still wrong here specifically because a genuine implementation was one composition away,
using capabilities the codebase already trusts. Removing a promised capability because implementing
it looked expensive, when it was not, would trade one failure (answers the wrong question) for another
kind of the same failure named in ADR 0044/0048's spirit: a caller who read the description before this
fix and built around `manifest` would silently lose the capability rather than gain a correct one.

**`conducks_coverage` gets a `limit` parameter (default 75, max 500) and an honest `truncated`.** 75
was not guessed: `functions.slice(0, N)` was measured against this repo's own 680-function baseline
at N = 30, 40, 50, 60, 70, 75, 78, 80, 90, 100 through the exact `JSON.stringify(res, null, 2)` the
tool's own formatter uses. 75 produced 23,279 characters — the largest round number with real margin
under the ~25,000-character ceiling the todo set (80 already reaches 24,832, too close to the edge to
trust on a repo with longer paths than this one). `summary` (`total`/`full`/`dark`) is computed over
the FULL bound set before the cap is applied, so counting still answers "how much of the codebase is
covered" even when the list itself is capped — only `functions` is sliced. `meta.truncated` is now
`shown.length < bound.length`, the same shape `conducks_prune` and `conducks_flows` already use.

**Not chosen: a token budget like `conducks_context`'s `max_tokens`.** `context` needs a token budget
because its items vary wildly in size (BFS neighbours across arbitrary node kinds) and diminishing
returns matter for ranking. `coverage`'s rows are close to uniform in shape (`name`, `file`, `start`,
`end`, `pct`, `branchTaken`, `branchTotal`, `bound`), so a row-count `limit` — the same shape `query`,
`prune` and `flows` already carry — is simpler and answers the same question without a second
estimation mechanism to keep in sync with the first.

## Consequences

`manifest` costs the ~165 MB graph load `health`/`map` were built to avoid. That is deliberate: it is
now a genuinely heavier operation, the same weight `conducks_audit` already carries, and callers who
only want cheap staleness stay on `health`.

A caller relying on `conducks_coverage`'s previous unbounded shape now gets at most 75 rows by
default and must raise `limit` (up to 500) for more. `summary` counts do not change, so any consumer
reading only `summary` is unaffected; a consumer iterating `functions` expecting all 680 must now
either raise `limit` or check `meta.truncated` and page — there is no cursor/offset, so a caller
needing the full set beyond 500 has no way to page past it today.

`Open:` whether `conducks_coverage` should support an offset/page parameter for repos larger than 500
bound functions. No todo carries this yet — it was out of scope for todo28's Phase 2, which asked
only for a default that fits and an honest `truncated` flag, both delivered here.
