# Agent rules — read this before you touch anything

Standing rules for every subagent working on conducks. Your prompt says "read this and follow it";
this is that file. It is not a doc governed by `docs-lint` — it is instructions to you.

## 1. Stay in lane

- You own an explicit **file list**. Edit those and nothing else.
- A finding OUTSIDE your lane is never edited. Report it as an applyable spec: exact `file:line`,
  the change, and why. "X is missing" is not a finding; "`persistence.ts:812` returns before the
  read-only check, so a read-only vault silently reports 0 swept" is.
- **You do NOT edit `docs/`.** Not todos, not ADRs, not memory.md. Seven agents share one docs tree
  and would collide. The orchestrator owns `docs/` and writes it from your handover.

## 2. Verify before you claim done

- `npx tsc --noEmit` — WHOLE program, 0 errors. A per-file check that misses your change is worthless.
- `npm test` — full suite green. Not just your new test.
- `npm run build` if you changed anything under `src/`.
- If a gate is red for a reason that predates you, say so with the output. Do not fix unrelated red.

## 3. A test that cannot fail is worse than no test

**Mutation-check every test you write.** Break the source deliberately, watch the test go red,
restore it. If it stays green, your test asserts nothing and you must say so rather than count it.

This has caught four vacuous tests on this project in one session. It is not optional.

## 4. Measure, do not assume

- Any performance or correctness claim needs a before/after number from a real run.
- **Read totals alongside the metric.** A dangling-edge count that falls while the RATE rises means
  the graph shrank, not that it improved. That exact trap cost a near-miss regression here.
- If you cannot measure it, say the number is unknown. Never estimate and present it as measured.

## 5. Write as you go

Append to `.claude/agent-runs/<run>/<your-id>.md` BEFORE each action — what you are about to do and
why. A token cutoff must leave the next agent able to resume. Never batch this at the end.

## 6. Never

- `rm` anything. Hand the command to the orchestrator.
- `git reset --hard`. It is DENIED by the permission system, and routing around a denied destructive
  command with an alias is worse than the stale base you are trying to fix. A wrong worktree base is
  the ORCHESTRATOR'S defect to repair — report your HEAD and stop, exactly as agent-A did.
- `git add -A`, commit, push, or rebase. The orchestrator merges.
- `as any` or `@ts-ignore` to force a gate green. That IS the failure, hidden.
- Touch a file another agent owns, even to fix something obvious.
- Add `Co-Authored-By:` anywhere.

## 7. Your output is a handover, not code

Return, in prose:

1. **What you changed** — file by file, one line each, and WHY that shape
2. **What you measured** — before/after numbers, and how you got them
3. **How you verified** — including which mutation you ran and what went red
4. **What you did NOT do** — deferred vs dropped, with the reason
5. **Out-of-lane findings** — as applyable specs

No code dumps. The orchestrator reads your reasoning and inspects the diff itself.

## Do not cook the laptop

`analyze` sizes its worker pool at `os.cpus().length - 1` — 11 workers on a 12-core machine — and the
test suite spawns `analyze` many times over. Twelve cores saturated for minutes is what makes the
machine hot, and it buys very little: measured on sofie (10.5k nodes), 11 workers analyzes in 20s and
4 workers in 23s. A 15% wall-clock cost for roughly a third of the load.

- `CONDUCKS_WORKERS` caps the pool. Tests set it to 4 automatically (`tests/helpers/cap-workers.mjs`);
  an explicit value always wins, so a benchmark can still ask for full width.
- **Do not use the full suite as a reproduction harness.** It is ~4 minutes and runs everything. To
  chase one failing test, loop THAT test — and if it is load-dependent, add load deliberately rather
  than running the suite twenty times. Diagnosing a flake this way once cost an hour of wall time and
  produced a wrong conclusion; a targeted probe answered it in ten runs of five seconds.
- Reach for the full suite as a GATE — before a commit, after a change lands — not as an inner loop.
- `npm run test:fast` IS the inner loop: **26s against the gate's 239s**, 1,143 of the 1,813 tests. It
  parallelises and drops the per-file worker recycling, and pays for that by skipping the suites that
  need either constraint — anything loading tree-sitter grammars or driving a real vault.
  The excluded set is a PATH RULE, not a file list: which grammar suite fails depends on scheduling
  (whichever lands second in a process), so a list would go stale silently while looking like it still
  protected something. If your failure is in an excluded path, use `npm test` — a diagnostic tool that
  quietly skips your test is worse than no tool.
