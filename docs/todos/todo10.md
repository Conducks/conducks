# todo10 — finish the type-aware governance pass (ADR 0016 + 0017)
Status: doing
- Acceptance: `conducks audit` on conducks reports 0 circular dependencies and 0 hub overloads, or
  each remaining finding is confirmed genuine with evidence; cross-checked against `madge`.

## Phase 1 — ARCH-3 as a module import cycle (ADR 0017)
- [x] Restrict the audit's cycle detection to import-level via `IMPORT_CYCLE_IGNORED_EDGE_TYPES`
      (containment + TYPE_REFERENCE + CALLS/CONSTRUCTS/ACCESSES); all four `detectCycles` call
      sites now share one definition
- [x] Regression tests: genuine import cycle → 1; mutual-call tangle with no import cycle → 0;
      type-only import cycle → 0
- [x] Suite counts were inflated by abandoned agent worktrees under `.claude/worktrees/` running
      duplicate stale copies — the `npm test` script's CLI `--testPathIgnorePatterns` silently
      overrode the config list. Real suite is 7 suites / 31 tests, not "49"
- [ ] Cross-validate against `madge` per ADR 0010's bar — conducks and madge must agree on conducks
- [ ] ARCH-3 still fires on conducks; the cause is Phase 2, not the cycle definition

## Phase 2 — the real ARCH-3 blocker: binding misclassification
Two separate causes stop `algorithms/* → adjacency-list` imports from qualifying as type-only, which
is what actually keeps the cycle alive (`adjacency-list → cycle-detector` is a genuine runtime
import, so only the return direction can clear it):
- [ ] **Case collision.** Node IDs are lowercased (required for APFS, see memory.md), so the local
      parameter `nodeId` in `traversal.ts:44` and the imported type `NodeId` both key to `nodeid`.
      The variable's value uses mark the TYPE as value-used. Name-based classification cannot work
      on lowercased bare names — the type/value sets need original case or scope awareness
- [ ] **No type evidence.** `ranker.ts:1` imports `ConducksNode` and never uses it, so there is no
      positive type evidence and the conservative rule leaves it a value import. This is a genuine
      unused import — worth flagging as dead code in its own right
- [ ] Re-measure after both: more of the 1238 IMPORTS edges should qualify (213 today)

## Phase 3 — the registry hub, now a real finding
- [ ] `registry/index.ts::registry` sits at 60 upstream connections against a limit of 50, after
      type-only edges were removed. Establish what the 60 are before acting — if they are genuine
      runtime fan-in, this is the composition-root coupling the earlier audit flagged
- [ ] Decide: split the registry by domain (core/analysis/governance), or raise the limit with a
      recorded reason. Do not silence it without one

## Phase 4 — deferred, not dropped (ADR 0017)
- [ ] Surface symbol-level mutual-call tangles as their own finding, separate from ARCH-3, with its
      own severity. ADR 0017 removed them from ARCH-3 deliberately; they are currently reported
      nowhere
- [ ] Other languages are type-blind: Python/Rust/Java/C# have no `pulse_type_target` capture, so
      `isTypeOnly` never fires for them. Either add the captures or document the limit per language
