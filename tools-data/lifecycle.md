# Lifecycle Guidance

> Four mandatory phases. Always in order: Plan → Execute → Verify → Memory.
> You must complete each phase before moving to the next.

---

## Phase: Plan

**Philosophy:** Intent first, code second. No file is touched until a written, approved plan exists in `todo.md`.

### Rules

**PLAN-1 — Vision Check** `[severity: high]`
When a new idea, requirement, or change in direction arrives, read `vision.md` first. Decide if this is genuinely new or a refinement of something already logged. Then **confirm with the user before writing anything**: _"I think this is a new direction — shall I log it to vision.md?"_ Append only after explicit confirmation.

**PLAN-2 — Write the Plan First** `[severity: high]`
Before touching any file, write the full plan in `todo.md` using phases and tasks. Each task must name the files it affects and have acceptance criteria. A plan without acceptance criteria is not a plan.

**PLAN-3 — Boundary Check** `[severity: medium]`
Identify every module, service, and file the change will touch. Open `conventions.md` and check for forbidden import paths before writing a single line of code.

**PLAN-4 — Scaffold Check** `[severity: medium]`
If this involves creating new files or folders, draft the full file tree in `architecture.md` first. Get approval on the structure before creating anything.

**PLAN-5 — Get Approval** `[severity: high]`
Present the plan and wait for an explicit yes. Do not interpret silence or a vague response as approval. No execution without a clear go-ahead.

---

## Phase: Execute

**Philosophy:** The plan is approved. Execute it precisely. No scope creep, no unrequested changes, no cleanup detours.

### Rules

**EXEC-1 — Plan Must Exist** `[severity: high]`
If there is no approved plan in `todo.md`, stop. Return to Plan phase. A feeling that you know what to do is not a plan.

**EXEC-2 — Check Conventions Before Every Import** `[severity: high]`
Before writing any import statement, check `conventions.md` for this service. If the import is forbidden, find the approved path or flag it to the user. Never bypass a convention silently.

**EXEC-3 — Update Architecture on Contract Changes** `[severity: high]`
Any change to a public interface, shared type, API contract, or module boundary must be reflected in `architecture.md` before moving to the next task. Do not defer this.

**EXEC-4 — Minimal Impact** `[severity: medium]`
Make the smallest change that satisfies the task. Do not refactor adjacent code unless it is explicitly in the plan. Log unplanned observations in the parking lot of `todo.md`.

**EXEC-5 — Zero Pollution** `[severity: medium]`
No `console.log`, commented-out code, debug statements, unused variables, or temp files in committed work. Run lint before marking any task complete.

**EXEC-6 — Memory During Execution** `[severity: medium]`
If you use a workaround, make a non-obvious assumption, or touch something fragile — write it to `memory.md` immediately. Do not leave it for the memory phase. Fragile things forgotten mid-session become traps.

**EXEC-7 — Convention Detection** `[severity: medium]`
If you notice an implicit rule or recurring pattern not in `conventions.md`, append it to the agent-detected section and flag it: _"I noticed a pattern — added it to conventions.md for your review."_

**EXEC-8 — Track Progress** `[severity: low]`
Mark tasks `[x]` in `todo.md` as they complete. Mark blocked tasks `[!]` with the reason inline. Keep `todo.md` current throughout — not just at the end.

---

## Phase: Verify

**Philosophy:** Trust but verify. Every change must be proven correct before the session closes.

### Rules

**VERIFY-1 — All Tasks Accounted For** `[severity: high]`
Every task in the current phase of `todo.md` must be `[x]` or `[!]` before verify begins. An unmarked task is an unfinished task.

**VERIFY-2 — Build, Lint, Test** `[severity: high]`
Run `npm run build`, `npm run lint`, and all tests. Do not mark any phase complete if these fail. If a test is known-broken for unrelated reasons, document it explicitly in `memory.md` — never silently ignore it.

**VERIFY-3 — Convention Audit** `[severity: high]`
Scan every changed file for violations of `conventions.md` import rules. Fix violations or get explicit user approval before merging.

**VERIFY-4 — Diff Review** `[severity: medium]`
Review your own diffs. Look for unintentional side-effects, missing edge cases, and changes that weren't in the plan. If you find something, flag it before closing.

**VERIFY-5 — Output Check** `[severity: medium]`
Compare actual output — terminal, UI, API responses — against the acceptance criteria written in `todo.md`. Acceptance criteria exist for this moment.

**VERIFY-6 — Log Audit** `[severity: medium]`
Check application logs and system output for new errors or warnings introduced by the change. A passing build with noisy logs is not a clean pass.

---

## Phase: Memory

**Philosophy:** The next agent starts cold. Leave the trail you wish you had found.

### Rules

**MEM-1 — Verify First** `[severity: high]`
Do not write memory until verify is complete. Memory written before verification may document a state that doesn't hold.

**MEM-2 — Write What Must Not Be Forgotten** `[severity: high]`
Append to `memory.md` anything a future agent could not infer from the code: workarounds and why they exist, silent assumptions the codebase depends on, traps that cost you time, constraints from external systems. Keep entries short — if it needs a paragraph, it belongs in `handover.md` instead.

**MEM-3 — Handover on Request** `[severity: high]`
Only write `handover.md` when the user explicitly asks. When they do, overwrite it completely. Be honest, specific, and paranoid. Name files and functions. Do not optimise for looking good.

**MEM-4 — Implementation Log on Request** `[severity: high]`
Only append to `implementation.md` when the user explicitly asks. Cover only what happened since the last entry. Do not retroactively fill gaps.

**MEM-5 — Context for Future Agents** `[severity: medium]`
Every memory entry must answer: what is this, why does it exist, and what breaks if it is ignored. A note without a "why" is noise.
