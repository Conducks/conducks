# Handover — 2026-08-08
Status: current

## Where it stands
Gates green: **1,670 tests / 213 suites**, `cli:smoke` 28/28, typecheck 0, `guard` clean (risk 0.022),
`docs-lint` 178, `visuals-lint` clean (57 anchors, 22 pages, 56 review stamps). One branch, `main`.
All three frozen subjects `unchanged` vs baseline.

## The board has three open items, and that is honest
`todo16` (npm publish — Said's command to run), `todo52` (give the persistence handle an owner so tool
calls can overlap again) and `todo53` (finish walking the MCP surface). `todo31` stays deliberately
parked with its reopen-triggers. Everything through `todo51` is closed and in `completed/`.

`todo48`, `todo49` and `todo50` closed on 2026-08-08; `todo51` with them.

## 2026-08-08 — the agent-facing surface, and what it cost
The CLI walk had been the whole story. Pointing the same method at the MCP surface — driving tools the
way an agent does rather than reading them — produced **eight defects in eight attempts**. Every one of
them returned a payload beforehand, which is the bar that keeps proving worthless.

The two that matter most, because both produce WRONG ANSWERS rather than errors:
- **Pipelined calls raced the shared registry.** `ensureGraphLoaded` cleared `pendingLoad` before
  awaiting the load, so a second caller walked an empty graph and reported `SYMBOL_NOT_FOUND` for
  symbols that exist. It did not throw — it answered. ADR 0146.
- **`conducks_prune` with an unknown `type`** returned `{ORPHAN: 0, UNUSED_EXPORT: 0, STALE_IMPORT: 0,
  total: 0}` — a clean bill of health for the whole codebase, from a typo.

Also fixed: `watch` was blind to files created after it started (`git diff HEAD` prints nothing for an
untracked path — todo51), `diff` had the SAME blind spot in the PR risk engine, `status` reported an
empty vault as `READY`/`SYNCHRONIZED` (`status: 'ready'` was a string LITERAL in both status functions),
the MCP payload dropped that verdict entirely, and `conducks_rename` told the agent to run
`conducks_analyze`, a tool that does not exist.

## The recurring class, now enforced rather than written down
17 of 132 memory entries were ONE defect: nothing examined reported as a negative finding. ADR 0124
stated the rule in prose and it was violated eight more times, because a principle cannot bind dozens
of independent render sites and a grep cannot tell a lying branch from an honest one.

ADR 0145 moves it to the compiler. `Verdict<T>` in `contracts/verdict.ts`: `clean` cannot be
constructed without `examined`, `nothing-to-check` is its own variant, and `renderVerdict` switches
with no default — adding a fourth variant fails the build (verified by adding one, TS2366).
**Migrated: `advise` only.** The others turned out not to need it — their empty case was already a loud
refusal, now translated at the single CLI error boundary instead of leaking the internal guard.

## Known cost, recorded rather than silent
Serialising tool calls (ADR 0146) made ADR 0128's own probe go **274 ms → 2,135 ms, ~8×**, on six
concurrent calls. Accepted because the alternative is a confidently wrong answer, and carried by
`todo52` so it is not mistaken for the end state. The graph-load fix stands on its own; only the
persistence-handle ownership still needs the queue.

## Traps for the next session
- Frozen benchmark subjects (`test-projects/{scraper,orchestrator,sofie}`) take NO commits, ever.
  `tools/benchmark/health.mjs --compare` is the drift gate; analyze always `--force`. `--cold` now
  exists and measures the FIRST analyze — the default baseline describes the second.
- **A check written after its fix must be seen RED first** (`npm run cli:mutate`). Every fix this
  session was mutation-verified, and two earlier checks were vacuous when mutated.
- **A test must never re-implement what it tests.** The SQL guard's multi-statement hole survived in
  both the guard and its replica. Export the real function and call it — `sqlGuardReason`, `enumErr`.
- **A mocked handler has no shared singleton to corrupt**, which is why every unit test passed while
  pipelined calls were returning wrong answers. Concurrency needs the real server over stdio.
- `tools/mcp-parallel.mjs` counts a call `ok` when neither `r.error` nor `result.isError` is set —
  `mcpErr` sets NEITHER, so it cannot see a tool-level wrong answer. Do not read it as correctness.
- The stamp gate WILL flag your edits: touching a file cited by a module note prints a re-read flag.
  That is it working — re-read, then `visuals-lint --stamp <page>`. Do not bulk-stamp. Twice this
  session the flagged anchor had genuinely drifted (one by ~57 lines, hidden until an unrelated edit
  changed the file's hash).
- `blocking-commands.test.ts` spawns real servers and polls; it flakes under full-suite CPU load and
  passes isolated. If it recurs, move it to a serial jest project rather than widening the window again.
- sofie (`assistant/sofie`) sits ~96 commits ahead of origin, unpushed by decision — Said's call.
- `.conducks/note-reviews.json` is COMMITTED (the one carve-out from the ignored vault dir).

## What the earlier stretch built (read the ADRs, they carry the reasoning)
- **The visuals pipeline** (ADR 0138–0142): anchors checked against the working tree; drift proven by
  re-running the repo's DECLARED generator with a restore contract; module notes are SOURCE at
  `docs/visuals/modules/<path>.md`; review stamps hash the exact cited span.
- **conducks arch** finished ADR 0134's program: doors, composition root, layer direction, per-service
  monorepo verdicts, cluster shape.
- **Adoption is one command**: `conducks setup` installs skills, MCP, registry, ignore file and the
  pre-commit gates; skills re-sync on every build.
- **trace/context tell dependency from co-location** (todo38); `context` opens with the symbol's
  callers and their call-site lines.
- **The id re-case was decided AGAINST by measurement** (todo32).

## If you pick something up
`todo53` is the highest-value: the MCP surface has yielded a defect every single time it has been
driven, and roughly half of it is still unwalked. `todo52` buys back the 8×. The deferred canvas→note
link map in sofie and the DERIVED-header warn→error raise remain, neither urgent.
