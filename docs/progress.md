# Progress — conducks

## 2026-07-18 · coverage matcher fix (todo08)
- Fixed coverage-bind matchFile: dropped bare-basename fallback → boundary + ≥dir/basename suffix
- Result: 64 phantom-FULL index.ts rows → 2 real rows; summary honest (0 full · 14 partial · 77 dark)
- Locked with 4-test regression suite; full suite 30/30, typecheck clean. todo08 done.

## 2026-07-18 · MCP surface + format truth pass
- Conducks: +2 MCP tools (docs, coverage), −1 (guide→skills), coverage-bind extracted to domain
- Shipped: ADR 0006/0007; skills content refreshed (phantom pulse/kinetic_* names fixed); ManifestEngine now scaffolds the grammar set flat under docs/
- Superseded: skills-generator junk drawer deleted (ADR 0006); vault-dedupe premise retracted (todo08 rewritten to the matchFile bug)

## 2026-07-17 · coverage + docs-as-data + clean architecture
- Conducks: taxonomy (+PACKAGE/STATEMENT/BRANCH/DIRECTORY), lineEnd fix, coverage/coverage-view/docs-status/docs-lint commands, layer guard
- Shipped: todo01 spine proven end-to-end; todo06 done (contracts leaf, cycle broken by inversion, all sentinel rules clean); conducks docs reformatted to the grammar (3-agent fleet)
- Superseded: hand-written architecture.md → DERIVED via context-gen (ADR 0001/0005)
