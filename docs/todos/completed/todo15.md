# todo15 — watch the docs, and link the decisions that predate the link fields

Status: done
- Enforced by: tests/unit/domain/docs/docs-watcher.test.ts
- Promoted: docs/features.md ("Docs Board", "Docs Grammar Gate"); conducks-docs skill (a closed todo's `- Builds:` link must be promoted to `- Enforced by:`)
- Acceptance: editing a governed doc emits a pulse that re-lints it without anyone typing a command, and every ADR that asserts something about the code carries a `- Builds:` phase or an `- Enforced by:` artifact

Two loose ends from ADR 0020. The link graph exists and is enforced, but nothing WATCHES the docs —
`docs-lint` only runs when someone types it, so drift is caught at review time instead of at write
time. And every ADR written before the link fields existed reports `unlinked`, which is accurate but
means the "which decisions still owe work" view is empty until the backlog is linked.

## Phase 1 — a docs watcher on the existing heartbeat
- [x] watch `docs/` on the same synapse heartbeat the graph already uses (`GatewayService.watchSynapse` / `evolution.watcher`), debounced — a governed file changing re-lints only that file
- [x] broadcast the result on the existing SSE pulse so the mirror's Docs panel updates live instead of on click
- [x] decide the failure surface: LOG-ONLY. A watcher that fails hard turns a save into a broken loop and gets disabled; the exit-code surface stays on `conducks docs-lint` for CI and pre-commit

## Phase 2 — link the ADR backlog, as work is picked up
- [x] add `- Builds:` to the phases that are already implementing an existing ADR (0010, 0013, 0016, 0017 have live work in todo09/todo10)
- [x] add `- Enforced by:` to the ADRs that already have a test proving them — the taxonomy suite, the layer-boundary gate, the skills↔tools test
- [x] leave the purely definitional records unlinked on purpose: 0001-0004, 0007-0009, 0011-0013, 0015, 0020 assert a standard or record a divergence, not code — they carry no build link by choice

## Phase 3 — close the five finished todos
- [x] promote the surviving facts out of todo06, todo11, todo12, todo13, todo14, then move them to `todos/completed/` — they are the six hygiene warnings on the board today
