# todo08 — coverage matchFile over-binds by basename (false FULL rows)
Status: done
- Acceptance: a covered file's lines bind ONLY to nodes from that exact file; running coverage on conducks shows each index.ts scored from its own coverage, not one file's lines lighting all 12

## Phase 1 — fix the matcher
- [x] reproduced: `conducks coverage scratch/cov/coverage-final.json .` showed 64 index.ts rows all FULL from ONE covered index.ts (matchFile's endsWith-basename fallback)
- [x] fixed coverage-bind.ts matchFile: dropped the bare-basename fallback; suffix match now requires a path-segment boundary AND ≥ dir/basename (suffix must span a "/")
- [x] verified: 64 → 2 index.ts rows, fill varies (90%/69%) not phantom FULL; summary honest at `0 full · 14 partial · 77 dark`. Locked with tests/unit/domain/analysis/coverage-bind.test.ts (4 tests). Full suite 30/30 green, typecheck clean.

## Retraction note (supersedes the original todo08 premise)
- Original premise "incremental analyze duplicates vault nodes" is FALSE — verified: clean+analyze
  then incremental analyze → 5074 → 5074 nodes, zero duplicate name+file+span rows. The repeated
  rows in coverage output were 24 REAL distinct functions (each language plugin has its own
  calculateComplexity) wrongly all bound to one covered file by the basename fallback.
