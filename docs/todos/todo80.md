# todo80 — make conducks the daily tool for agent-gateway
Status: todo
- Acceptance: every agent on agent-gateway answers wiring questions with conducks instead of git grep, and every answer names the commit the graph matches.

Context: conducks was used for real on agent-gateway on 2026-10-06. It was never switched on for that project, so every agent fell back to git grep. Switching it on took 128 s for a fresh staging copy, and it already answers questions grep cannot. The blocker is not the tool itself — the graph is not built, the answers are too heavy, and the board is too big.

## Findings (2026-10-06, agent-gateway)

1. It was never switched on for agent-gateway: no code graph existed in the main clone or in any worker's copy, so every agent (firstmate and workers) fell back to git grep. Root cause of "barely used".
2. Building one on a fresh copy of agent-gateway staging took 128 s (39,108 nodes, 144,618 edges).
3. It already does more than assumed: conducks_impact on src/services/context/builder.ts::assembleRequest returned 116 affected items, including indirect callers 2-3 hops away and the governing decision records (0086, 0139, 0365) through the 443 doc->code governance edges; grep cannot do either.
4. Answers are too heavy: every result repeats the full absolute path 3 times (id, file, summary); 12 impact results cost about 5,000 tokens against about 700 for the equivalent grep lines.
5. The "what's left" board is too big to use: conducks_docs layer=board returned 98,672 characters (MCP refused it inline); the CLI docs-status printed 33,905 characters. Cause on the project side: 41 todos marked "doing" with about 5 workers running, many ADRs left "partial".
6. Each worker copy (worktree) needs its own 2-minute build, and none do it.
7. Stamps (visuals-lint --stamp) became a treadmill: stale reviewed claims went 1,669 -> 1,681 after four re-stamp batches; "stale" only means the cited code changed, not that the sentence is wrong, so the list grows faster than anyone re-reads it. Anchor and drift checks are the useful part (they block real breakage).

What would make agents use it daily: the graph builds and updates itself per project and per worktree (incremental on commit) and each answer says it matches the current commit; short answers by default (repo-relative ids, top results, no repeated paths); one-call answers to "who calls this / what breaks", "which decisions govern this file", "what's left"; generated structure in pages instead of hand-stamped claims; log each fallback to grep and why.

## Phase 1 — build and update the graph per project and per worktree
- Builds: 0160
- [ ] Build the code graph on every fresh clone of agent-gateway staging, and keep it current with an incremental update on each commit.
- [ ] Each worker copy (worktree) builds its own graph instead of falling back to git grep.
- [ ] Every answer names the commit the graph matches.

## Phase 2 — short answers by default
- [ ] Results use repo-relative ids, top results first, and no repeated full absolute paths.
- [ ] "who calls this" and "what breaks" answer in one call.
- [ ] "which decisions govern this file" answers in one call.

## Phase 3 — one-call "what's left"
- [ ] conducks_docs layer=board returns a board small enough to read inline.
- [ ] "what's left" answers in one call.

## Phase 4 — generated structure instead of hand-stamped claims
- [ ] Structure pages are generated from the graph, not hand-stamped.
- [ ] Anchor and drift checks block real breakage; the stamp treadmill is retired.
- [ ] Every fallback to grep is logged with the reason.