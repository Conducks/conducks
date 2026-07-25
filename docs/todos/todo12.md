# todo12 — Skills + docs truth pass across the CONDUCKS repo group (single orchestrated run)
Status: done
- Acceptance: every `conducks_*` name in `src/resources/skills/*.md` exists in the registered MCP surface (enforced by a test), no skill instructs a behaviour banned by ADR 0011/0015, the tool count is derived from one place, `website/docs` carries the full governed set, and typecheck + suite + `docs-lint` are green in both repos with nothing that worked before broken.

Runs as ONE orchestrated pass. Main thread orchestrates, gates, and commits; it does not build.
Subagents do the work, one scoped task each, disjoint file ownership. Governed by ADR 0018.

**Scope.** `CONDUCKS/` is NOT a monorepo — it is two independent git repos (`conducks/`, `website/`)
plus non-repo folders. Each repo is a SINGLE unit: flat `docs/`, no root-vs-unit split, no epics.
`test-projects/` and `archive/` are fixtures and write-once material — out of scope, never edited.

**Deletion policy (binding on every agent).** No deletion without citing one of three reasons:
(a) an ADR ordered it, (b) zero references proven two independent ways, (c) the code contradicts the
doc and code wins. Anything else is REPORTED, not touched. Out-of-lane findings ship as an applyable
spec (`file:line` + the change + why), never as an edit. Any code deletion, or any doc deletion over
20 lines, is independently re-verified by a second agent before it lands.

**Do not break what works.** Every phase gates on typecheck + suite before the next starts. A red
gate stops that phase and reports; it never gets papered over.

## Phase 1 — Land the current pass (sequential, blocking)
- [x] Commit the pending files: 3 root generated docs deleted (16,551 lines), 9 docs corrected, conducks-docs skill 234 → 317 lines, ADR 0018 + this todo
- [x] Confirm the three skill copies are in parity before anything edits them (`src/resources/skills/` → `build/src/resources/skills/` → `~/.claude/skills/`)

## Phase 2 — Skills truth pass (parallel, one agent per skill, disjoint files)
- [x] `conducks-guide` — rewrite as a conducks entry point over the 14 live tools; DELETE the frontend/backend/security/presentation content (ADR 0006 ordered it; the deletion was incomplete)
- [x] `conducks-cli` — drop `context-gen --out docs/architecture.md` and `conducks blueprint`; verify every remaining command against `src/interfaces/cli/commands/`
- [x] `conducks-exploring` — remove the leaked `</content><parameter name="filePath">…` tail; fix all three dead probe names
- [x] `conducks-impact-analysis` — `conducks_synapse_impact` → `conducks_impact`; keep the depth levels and risk matrix
- [x] `conducks-refactoring` — fix `synapse_impact`/`sentinel_audit`/`blueprint_gen` references; drop "update architecture.md" (ADR 0011/0015); correct `lib/product` to the real layer names
- [x] `conducks-debugging` — correct `lib/product` paths only; its tool names are already valid, leave them
- [x] `conducks-governance` — drop the dead `blueprint_gen` probe; the SKILL stays (guidance ships as skills)

## Phase 3 — Tool-count truth + the enforcing test (sequential, after Phase 2)
- [x] `server.ts:65` — derive the count from the registered list; delete `MANDATED_TOOL_COUNT` (asserted 13; ADR 0006 said 12; CONDUCKS-9 says 9; reality is 14)
- [x] Rewrite `CONDUCKS-9` to state the rule (registered in one place, count derived), not a number
- [x] Add the ADR 0018 §4 test: every `conducks_*` named in `src/resources/skills/*.md` must exist in the registered surface
- [x] Remove `generateBlueprint()` (`conducks-core.ts:356`) — zero callers proven twice (repo-wide grep + typecheck passing after removal)
- [x] `npm run build` so the shipped `build/src/resources/skills/` copy is current
- NOTE: there is no `blueprint_gen` MCP tool to remove — verified absent from every `.ts`. Only skill references were stale.

## Phase 4 — conducks/ docs re-examination (parallel, one agent per area)
- [x] `features.md` — verify all 50 capabilities against the code; name the command in each heading; add the `## Tunables` table; a capability that does not exist is removed per "a doc never outranks the code", never on "could not find it"
- [x] `memory.md` (30 entries) — verify each against current code; delete what a convention now prevents; promote what became a rule
- [x] `conventions.md` — verify each CONDUCKS-N against the code it claims to bind (coordinate: Phase 3 owns CONDUCKS-9)
- [x] `architecture/` (20 MODULE.md) — confirm none carries a symbol map or a capability catalogue; confirm each states Boundaries and Deferred
- [x] `decisions/` (18 ADRs) — confirm every accepted ADR's durable consequence has been promoted into a living doc; file specs for the ones that have not
- [x] Root `README.md` + `docs/README.md` — re-verify every claim and command against the code

## Phase 5 — website/ repo (parallel with Phase 4, different repo, zero shared files)
- [x] Delete the generated `website/ARCHITECTURE.md` (untracked, stale 2026-07-17, banned by ADR 0011)
- [x] Bootstrap the missing governed files: `docs/README.md`, `docs/features.md`, `docs/progress.md`
- [x] Resolve stale `docs/implementation.md` — promote anything live, then retire it
- [x] Move `product_plan.md` + `styling.md` into soft folders (`product/`, `design/`)
- [x] Verify `docs/architecture.md`, `conventions.md`, `memory.md`, `handover.md` against the code — all are thin (10, 6, 23 lines) and unverified since July
- [x] Delete the empty `CONDUCKS/docs/` shell — zero files, and it implies a monorepo root that does not exist

## Phase 6 — Gate and close (sequential, main thread only)
- [x] `docs-lint` clean · typecheck 0 errors · full suite green · `conducks audit` on conducks still clean
- [x] Re-run the Phase 3 skills↔tools test as the final gate
- [x] Rewrite `handover.md` (overwrite, re-stamp) and add one `progress.md` entry per repo
- [x] Commit per phase; no push

## Result — 2026-07-25

13 subagents, all 6 phases closed. Gates at close: typecheck 0 errors · 44/44 tests, 9/9 suites ·
docs-lint clean (33 governed) · `conducks audit` confirmed · skills↔tools test green.

**Corrections to this todo's own plan.** There was no `blueprint_gen` MCP tool to remove — verified
absent from every `.ts`; only skill references were stale. `MANDATED_TOOL_COUNT` was a change, not a
deletion. Scope grew: `CONDUCKS/` is two independent repos, not a monorepo, so `website/` became its
own phase and the empty `CONDUCKS/docs/` shell was deleted.

**Real bugs found and fixed** (none were in scope when the todo was written):
- `conducks record` never worked — called `registry.manifest.record`, which does not exist; an `as any`
  cast hid it. Now `registry.status.record`, and its success message no longer names a path the engine
  never writes.
- `conducks setup` registered Claude Desktop against `<analyzed-project>/build/index.js` — a path that
  never exists — and omitted the `mcp` arg, so every auto-registered server silently failed to start.
- `audit` read a cwd-relative `config/sentinel.json`, so all project policy rules evaluated as `[]`
  outside the project root while reporting "Governance confirmed".
- `coverage-view` still carried todo08's basename bug (todo08 fixed only `coverage-bind`).
- MCP `conducks_impact` mode descriptions were swapped end-for-end. Descriptions fixed; the
  `default: "downstream"` mismatch against the CLI's `upstream` is left as a decision.
- `conducks explain` never printed `complexity` — the largest-weighted signal in its own score.

**The gate that never ran.** ADR 0005's layer contract is documented as enforced by `conducks guard`;
it is not. Measured with the rule force-enabled: ~71 illegal edges across 5 layer pairs. Enabling it
would hard-block immediately, so it was NOT enabled — `todo06` is REOPENED with the ordered fix, since
it had been closed on an acceptance criterion that was never met.

**Our own new test made the gate flaky** and was caught before commit: importing the MCP tool modules
booted registry singletons and raced the parsing suites (~1 run in 3). Diagnosed with a HEAD worktree
— HEAD green 3/3 at 35 tests, working tree flaky at 44 — then rewritten to read tool names as text.
Now 4/4 green in parallel.

**Deferred, with reasons:** the layer-contract migration (todo06), Java/PHP/Swift query files that
fail to compile and silently drop those languages to file-only (needs a new todo), and the
`upstream`/`downstream` default alignment (behaviour change, needs a decision).
