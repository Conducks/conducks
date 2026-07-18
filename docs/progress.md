# Progress — conducks

## 2026-07-18 · cycle-detection false-positive fix (ADR 0010)
- audit/guard/advisor now ignore STRUCTURAL_EDGE_TYPES (MEMBER_OF/CONTAINS/HAS_METHOD/HAS_PROPERTY)
  + require cross-file; deleted the broken SCC-as-ordered-path filter
- On TargetedCV (Next.js/TS, 22k nodes): audit 49 → 3 cycles, all 3 genuine cross-file import
  cycles. False-flag rate ~94% → 0%. Locked with 2 regression tests. Suite 41/41.

## 2026-07-18 · hard/soft docs + uninstall symmetry (ADR 0009)
- docs-grammar: dropped the prose whitelist + `unknown` type — soft is the default; governed core is
  the only universal set. Any non-governed doc → prose (valid, never flagged). 0 unknown on conducks
- architecture is now file-OR-folder: `architecture/` per-subsystem files classified as derived
- uninstall symmetric with setup: ConducksInstaller.remove() clears the workspace skills setup wrote
- conducks-docs skill updated (soft demotion, architecture file/folder); locked by docs-grammar.test

## 2026-07-18 · unify docs standard (ADR 0008)
- conducks-docs rewritten as the complete evolution of docs-rules (folder set, handover, ADR
  supersede/amend, todo epic/slice, linking, node-anchored intent, edge cases, format-first)
- docs-grammar.ts: +handover governed type, +prose type (category folders + README) — nothing in
  the standard reads "unknown"; locked with docs-grammar.test.ts. docs-lint clean (19 governed)
- docs-rules skill deleted; arch-audit + multi-agent-protocol repointed; stale .base dup removed
- Vault refs (VAULT.md, Workshop.md → phantom docs_rules.md) flagged for Said, not touched

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
