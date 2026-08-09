# todo54 — the two MCP defects todo53 measured and deliberately did not fix
Status: done
- Acceptance: a template that requires an identifier refuses when it is missing instead of returning zero rows, and `conducks_docs raw:true` returns a bounded payload whose `truncated` is measured — both driven over real stdio JSON-RPC, as todo53 was.
- Builds: 0145, 0124

## Context

todo53 walked the whole MCP surface and fixed 25 defects. These two were measured, reproduced, and
left standing on purpose, because fixing them well needed a decision rather than a patch — and a
guess would have traded a silent wrong answer for a wrong refusal.

They are recorded here rather than inside todo53 because a finding parked in a CLOSED todo is
invisible to `docs-status`: the board counts phases, and an unchecked line outside one is not work as
far as the board is concerned. That is the exact silent-board failure todo53 exists to prevent, so
these get a live record of their own.

## Phase 1 — a missing identifier param must refuse, not answer zero

- [x] `blast_radius` and `deep_impact` called with no `symbolId` answer `nodeCount: 0` — "nothing
      breaks if you change this", for a question that named no symbol. Measured over JSON-RPC.
- [x] Cause: `execute()` resolves a missing param to `PARAM_DEFAULTS[p] ?? ''`, and 9 of the 16 param
      names carry no default, so an absent identifier becomes the empty string and the SQL matches
      nothing. `minImporters` was the tenth and is already fixed (it was NUMERIC, so it crashed on
      `CAST('' AS INTEGER)` instead of answering quietly — the loud failure got fixed first, which is
      how the quiet one survived).
- [x] The blanket rule "no default means required" is WRONG and must not be applied: `find_by_name`
      passes `['', '', '']` on purpose for an unscoped fuzzy search, so `canonicalKind`, `namespaceId`
      and friends are legitimately optional-empty. Deciding which of the ten are which needs each
      template's SQL read.
- [x] Read out of each template's SQL. The library uses two shapes and only the second is required:
      `AND (CAST(? AS TEXT) = '' OR e.type = CAST(? AS TEXT))` means empty = "any", while
      `WHERE e.targetId = ?` means empty matches nothing. `REQUIRED_PARAMS` = symbolId, targetId,
      structureId, unitId, namespaceIdPattern. `edgeType`, `canonicalKind`, `namespaceId` and `query`
      stay out — they carry the guard, and unscoped fuzzy passes `query` empty deliberately.
      Implemented as a name-level `REQUIRED_PARAMS` set in `src/lib/domain/analysis/query-service.ts`
      rather than the per-template `required:` field this todo first proposed — none of the five is
      ever optional anywhere it appears, so one set is the smaller correct shape. `execute()` throws
      naming any required param that resolved to `''`.
- [x] Pinned by `tests/unit/domain/query-required-params.test.ts`. Verified over JSON-RPC: all seven
      templates with a required identifier refuse and name the missing param; `hotspots`, `cycles`,
      `dead_code`, `type_coupling`, `unused_exports`, `entry_points`, `layer_distribution` are
      unaffected; fuzzy with no `q` still answers; `blast_radius` with a full id returns 3.

## Phase 2 — `conducks_docs raw:true` is unbounded

- [x] Measured: 279,483 bytes, `meta.truncated: false`, no cap of any kind. The `coverage` tool's own
      comment documents ~25 KB as what an MCP response can carry, so this is roughly 11x over.
- [x] Not a lie about truncation — nothing IS truncated. The failure is that a caller gets a transport
      error with no field in the payload explaining why, and the description's "Large." is a warning
      rather than a bound.
- [x] An ENTRY COUNT turned out to be a poor proxy, and the measurement said so: `limit: 3` was 9,770
      bytes and `limit: 5` was 47,608 — a docs entry is not a fixed-size row the way a coverage row is.
      So the bound is BYTES, the technique `context` already uses for its token budget, with `limit`
      kept as a secondary entry cap. Calibrated against the rendered payload rather than assumed
      (the budget counts compact JSON, the response is pretty-printed, so rendered runs ~1.5x): budget
      10,000 -> 15,135 bytes, 15,000 -> 22,693, 20,000 -> 30,264. Default 15,000. Never cuts mid-entry.
- [x] Pinned in `mcp-docs-walk.test.ts`. Verified: `raw:true` now returns 22,693 bytes with
      `truncated: true` where it returned 279,483 with `truncated: false`.
