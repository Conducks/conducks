# Handover — 2026-08-09
Status: current

## Where it stands
Gates green: **1,766 tests / 223 suites**, `cli:smoke` 28/28, typecheck 0, `guard` clean (risk 0.022),
`docs-lint` 180 governed docs. One branch, `main`. All three frozen subjects `unchanged` vs baseline.

## The board is EMPTY, and here is what that does and does not mean
`docs-status` reads "Nothing open. Every phase is finished." `todo52`, `todo53` and `todo54` all closed
on 2026-08-09. What is left is not tracked as open work, deliberately, and none of it is invisible by
accident:

- `todo16` — npm publish. Everything gating it is green; the publish itself is Said's command to run.
- `todo31` — parked with reopen-triggers. NOTE: its `Status:` is `todo` with zero unchecked tasks, so
  the board cannot show it. That is a real blind spot in the grammar, flagged twice and not yet
  resolved — a file that says "todo" and appears nowhere.
- (closed 2026-08-09) `todo55` — `watch` missed files created in the first moment after startup,
  ~1 run in 3. Cause: the command never awaited chokidar's `ready`, so it reconciled and printed
  "Live Mirror Mode active" while the poller had no baseline. Fixed by awaiting it; 20 clean runs,
  mutation-verified.

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

## 2026-08-09 — the MCP surface walked to the end, and the queue removed
`todo53` drove all 14 tools and all 9 enums over real stdio JSON-RPC: **25 defects**, every one behind
a payload that looked fine. The recurring shapes, each now fixed at source rather than per tool:

- **A `::` id was never checked against the graph.** An invented symbol made `trace`, `impact`,
  `explain` and `context` answer "0 steps / 0 impact / 0 in radius / no risk fields" — four confident
  nothings. One `resolveSymbolId` in `shared/resolve-symbol.ts` now verifies the node exists.
- **A bound declared in `inputSchema` was a comment.** `radius: "two"` made `Math.min("two", 10)` NaN,
  which removed the depth guard entirely and produced the WIDEST possible walk from a junk value.
  `numErr`/`boolErr` join `enumErr`; bounds live in one constant the schema and the guard both read.
- **Denominators.** `flows` published the pre-filter total, `docs` reported health over a project with
  no `docs/`, `coverage` answered `{total: 0, dark: 0}` for a report matching nothing. `coverage` and
  `docs` now carry `Verdict`; `flows` reports `matching`.
- **`query` advertised a template it then refused** (`type_coupling`), and the refusal told the caller
  to consult the list that had just advertised it. The allowlist is now ASKED of the library.
- **`diff` reported 0 impacted symbols** while the CLI reported 7 on the same tree at the same moment —
  a private copy that had received neither of the CLI's two fixes, plus a matcher reading a cyclomatic
  count as a line span. One engine now (`change-set.ts`), reached through the registry.

`todo52` then removed ADR 0146's serialisation. ADR **0147** supersedes it and carries the correction:
0146 blamed the handle swap, and reverting each fix singly proved the swap caused NEITHER failure.
`pendingLoad` cleared on every call caused the wrong answer; `tool-registry` closing the shared handle
uncounted caused `Database was already closed`. The handle now has ONE owner —
`registry.infrastructure.acquireVault/releaseVault`. Probe: **2,135 ms → ~500 ms**.

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
- `tools/mcp-parallel.mjs` is FIXED and can now be read as correctness: it parses the tool payload,
  counts an in-payload `error` as a failure, drives six DIFFERENT tools, and exits non-zero. It is
  mutation-verified against a symbol that does not exist (`PROBE_SYMBOL=noSuchSymbolAnywhere` gives
  `ok=2 failed=4`, where the old test scored all six `ok`).
- **When several fixes land for one symptom, revert each ONE AT A TIME.** Three landed for the
  concurrency races and the obvious story was wrong — the ADR amendment written before the mutations
  credited the wrong fix and had to be corrected. ADR 0147 carries the cause table.
- **The architecture gate is load-bearing.** `boundaries.test.ts` blocked three separate attempts on
  2026-08-09 (`cli -> domain` twice, `mcp -> domain`, `composition -> mcp`). Each time it was right and
  pointed at where the shared code actually belonged — the registry, not the interface layer.
- The stamp gate WILL flag your edits: touching a file cited by a module note prints a re-read flag.
  That is it working — re-read, then `visuals-lint --stamp <page>`. Do not bulk-stamp. Twice this
  session the flagged anchor had genuinely drifted (one by ~57 lines, hidden until an unrelated edit
  changed the file's hash).
- `blocking-commands.test.ts`'s reaction case does NOT flake on CPU load — that note was wrong and is
  now todo55. Measured 2026-08-09: ~1 failure in 3 running it ALONE. Do not widen the window and do not
  move it to a serial project; both were tried as theories and the measurement disproves them. The
  `docs-watcher` debounce case WAS a genuine test-timing bug (a fixed 600 ms sleep, asserting before
  the debounce fired) and is fixed — it now waits on the condition and then proves the count stays 1.
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
