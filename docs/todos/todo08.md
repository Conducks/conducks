# todo08 — vault hygiene: dedupe nodes on incremental pulse
Status: todo
- Acceptance: repeated `conducks analyze` (no clean) yields the same node count as a clean full analyze — no duplicate rows

## Phase 1 — reproduce + fix
- [ ] reproduce: analyze twice incrementally, show duplicate function rows in coverage/docs-status output
- [ ] fix: on incremental pulse, purge prior rows for the pulsed unit before re-insert (persistence.saveNodes / pulse path)
- [ ] verify: node count stable across N incremental analyzes; coverage shows each function once
