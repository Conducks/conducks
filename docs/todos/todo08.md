# todo08 — coverage matchFile over-binds by basename (false FULL rows)
Status: todo
- Acceptance: a covered file's lines bind ONLY to nodes from that exact file; running coverage on conducks shows each index.ts scored from its own coverage, not one file's lines lighting all 12

## Phase 1 — fix the matcher
- [ ] reproduce: `conducks coverage scratch/cov/coverage-final.json .` shows 12 index.ts files all FULL from ONE covered index.ts (matchFile's endsWith-basename fallback)
- [ ] fix coverage-bind.ts matchFile: drop the bare-basename fallback; require a path-suffix match of at least dir/basename (or resolve both to absolute and compare)
- [ ] verify: only the genuinely covered files show non-zero fill; dark counts rise accordingly (they were inflated-FULL before)

## Retraction note (supersedes the original todo08 premise)
- Original premise "incremental analyze duplicates vault nodes" is FALSE — verified: clean+analyze
  then incremental analyze → 5074 → 5074 nodes, zero duplicate name+file+span rows. The repeated
  rows in coverage output were 24 REAL distinct functions (each language plugin has its own
  calculateComplexity) wrongly all bound to one covered file by the basename fallback.
