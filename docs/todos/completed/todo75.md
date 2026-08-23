# todo75 — remove rename, and stop writing to anyone's source
Status: done
- Acceptance: `conducks rename` and `conducks_rename` are gone, no module under `src/` writes to a file outside `.conducks/`, and the build, the suite and `docs-lint` are green.

## Context

ADR 0156 removes `conducks rename` after three separate wrong-answer classes in two benchmark rounds,
each under a success message. This todo carries the removal, the invariant test that keeps it removed,
and the promotion of the rule it establishes.

The decision was first made on 2026-08-18 and never written to `docs/`, which is why round 5 spent a
session rediscovering the same command. The ADR exists before this work starts for that reason.

## Phase 1 — take the writer out
- Builds: 0156
- [x] `conducks rename` no longer resolves as a command, and `conducks help` does not list it
- [x] `conducks_rename` is gone from the MCP surface, and the tool-name test that pairs every MCP tool to a CLI command still passes
- [x] `GVREngine`, `RefactorResult` and `EvolutionDomain.rename()` are gone, and `conducks prune` reports nothing newly orphaned in `src/lib/domain/evolution/`
- [x] the four rename test files are deleted rather than skipped — `rename-safety`, `rename-repeated-call-sites`, `rename-containment`, `replace-in-code` — following ADR 0151's precedent that a removed capability is proven gone by the absence of its code
- [x] `drift`'s renamed/moved detection still works: `drift-rename.test.ts` and `drift-rename-false-pairing.test.ts` pass untouched

## Phase 2 — prove it stays gone
- Depends: todo75#P1
- [x] an invariant case in `tests/unit/adr-invariants.test.ts` fails if a rename module returns under `src/`, in the shape ADR 0028 and ADR 0151 already use — run against the pre-removal build first to prove it can fail
- [x] a case asserting no MCP tool declares `destructiveHint: true` — written first as "nothing under `src/` writes outside `.conducks/`", which FAILED against 26 legitimate writers (`.conducksignore`, git hooks, MCP config, coverage HTML, docs scaffold). The ADR claimed more than was true and was corrected; the narrower assertion is the one that holds
- [x] ADR 0156 carries `- Enforced by:` pointing at those cases

## Phase 3 — promote what survives
- Depends: todo75#P2
- [x] the rule lands in `conventions.md` as a numbered rule with its reason: a tool that edits code must be exact or must not exist, and a capability `grep` already provides is not worth shipping
- [x] `docs/features.md` no longer advertises Graph-Verified Rename
- [x] the shipped `conducks` skill drops `rename` from its tool table and CLI list — and drops `fallback` and `audit --fallback` with it, removed by ADR 0151 and still documented, which is a live defect found in round 5
- [x] `memory.md` records that rename was removed and why, so nobody re-adds it — §6.5's removed-module rule
- [x] `conducks docs-lint` exits 0

Closed 2026-08-23. Full suite 2405/2405. Three findings the work produced that the plan did not
predict: the drift tests used `conducks rename` as a FIXTURE and broke when it went (they now rename
by hand, and the capability under test was never rename); `ConducksCore.rename` was a dead duplicate
with zero callers, the same shape ADR 0151 found in `ConducksCore.compare`; and the first draft of
the ADR overclaimed — "writes to nothing outside `.conducks/`" is false, and the invariant test is
what proved it before the claim shipped.

