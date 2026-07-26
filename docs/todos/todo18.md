# todo18 — loose ends: the decisions and the hygiene left behind

Status: done
- Acceptance: no open question from ADR 0026 remains unanswered, the docs gate runs without being remembered, and one conducks skill loads once rather than twice

Small items that were each real and none of which belonged to a bigger todo. Two were questions ADR
0026 deliberately left open; the rest was hygiene that only showed up when someone tripped on it.

## Phase 1 — answer the two open dead-code questions
- Builds: 0026
- [x] `clustering/daac.ts` DELETED, and not because it was merely unwired — it never worked. It looks up edges with `getNeighbors(filePath)` in a graph keyed by node id: of 1936 nodes in the live vault, ZERO have a file value that is also a node id, so its call term is identically 0. That caps affinity at 0.4 under its own default threshold of 0.5, so the merge loop exits on the first pass — measured, **501 files in, 501 clusters out**. Drop the threshold to 0.25 so it can merge and it collapses to **1 cluster of all 501 files in 37.3s**, because proximity is computed over absolute paths whose shared repo prefix dominates. `mirror.engine.detectCluster()` remains the implementation — ADR 0028
- [x] its archived test was GREEN over that broken code, because the fixture set `id` equal to `filePath` — the one arrangement in which the lookup resolves, and one the real graph never produces. Re-ran and confirmed before deleting. That trap is now CONDUCKS-28, since it applies to every hand-built graph fixture
- [x] `parsing/language-plugin.ts` — RESOLVED, it stays. `docs/todos/todo09.md:110` records `isSupported (language-plugin.ts:51): DECISION = KEEP — language-plugin API contract`, and `isSupported` sits at exactly `src/lib/core/parsing/language-plugin.ts:51`; `src/types/language-plugin.ts` has no such method. The KEEP refers to the parsing file

## Phase 2 — make the gates run by themselves
- Builds: 0029
- [x] pre-commit hook at `scripts/hooks/pre-commit`, installed with `npm run hooks` (`git config core.hooksPath scripts/hooks`) so the hook is version-controlled instead of copied into `.git/hooks` per clone. It skips entirely unless the commit stages a `docs/*.md` file, and skips with a warning rather than blocking when `build/` is absent — refusing a commit over a missing build artifact punishes the author for something unrelated. Verified by staging a deliberate bad `Status:` value: the commit was aborted
- [x] skill scope decided: **global only** (ADR 0029). A repo-local copy is not a pin, it is a second copy Claude Code also discovers — all four skills were loading twice. `sync()` now takes no scopes, installs to `~/.claude/skills`, and prunes a local copy by name while leaving foreign skills and the directory itself alone. `--global` / `--local` removed from `conducks setup`. Ran it here: 4 removed from the repo, 4 current globally
- [x] mirror Docs panel VERIFIED rendering, not just serving. `#dock-docs` → `loadDocs()` → 174 DOM nodes in `#docs-panel` carrying real board content ("Decisions with open work", `0016 partial`, `todo10#P2 3/4`), no error branch. Driven through the real `ui.js` against the live `/api/docs` payload on a minimal DOM shim — no browser driver or jsdom is installed. See `docs/memory.md` for why that shim was NOT kept as a test

## Phase 3 — clear the archived suite
- [x] triaged all 77 files by RUNNING them, not by reading them — the premise ("77 files referencing deleted symbols") was wrong: 60 of 77 had `@/` imports that all still resolved. Under a temporary jest config: **17 suites passed (89 tests), 60 failed**
- [x] 7 of the 17 were substantive and covered subjects with NO other test in the suite — ported as-is, location only: `core/algorithms/entropy`, `core/git/chronicle-interface`, `core/graph/diff-engine`, `core/graph/symbol-mapping`, `core/parsing/ignore-manager`, `domain/metrics/resonance`, `interfaces/tools/mcp-server`. Suite went 199 → 236 tests, 23 → 30 files
- [x] the other 10 passing suites were 8-line "does the module import" smoke tests — dropped, they assert nothing
- [x] the 60 failures classified before deleting anything: 28 missing modules, ~26 renamed or removed APIs (`is not a function`, reading undefined), 76 stale assertions. Sampled the most alarming one — `adjacency-list` "add and retrieve nodes idempotently" — and it fails because the retrieved node now carries normalised fields while the test compares object identity with `toBe`. Stale expectations, not live bugs
- [x] folder removed from the repo, and `tests/legacy` dropped from `.gitignore` and from `testPathIgnorePatterns` in `jest.config.js` — both now referred to nothing
- [ ] SAID: the folder was moved to `<scratchpad>/legacy-removed-2026-07-26`, not erased, because `rm -rf` is blocked in this session's sandbox. It was untracked and gitignored, so git cannot restore it. Delete that directory once you are satisfied with the 7 ported suites
