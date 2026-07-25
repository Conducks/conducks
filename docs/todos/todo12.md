# todo12 — Skills + docs truth pass across the CONDUCKS repo group (single orchestrated run)
Status: todo
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
- [ ] Commit the pending files: 3 root generated docs deleted (16,551 lines), 9 docs corrected, conducks-docs skill 234 → 317 lines, ADR 0018 + this todo
- [ ] Confirm the three skill copies are in parity before anything edits them (`src/resources/skills/` → `build/src/resources/skills/` → `~/.claude/skills/`)

## Phase 2 — Skills truth pass (parallel, one agent per skill, disjoint files)
- [ ] `conducks-guide` — rewrite as a conducks entry point over the 14 live tools; DELETE the frontend/backend/security/presentation content (ADR 0006 ordered it; the deletion was incomplete)
- [ ] `conducks-cli` — drop `context-gen --out docs/architecture.md` and `conducks blueprint`; verify every remaining command against `src/interfaces/cli/commands/`
- [ ] `conducks-exploring` — remove the leaked `</content><parameter name="filePath">…` tail; fix all three dead probe names
- [ ] `conducks-impact-analysis` — `conducks_synapse_impact` → `conducks_impact`; keep the depth levels and risk matrix
- [ ] `conducks-refactoring` — fix `synapse_impact`/`sentinel_audit`/`blueprint_gen` references; drop "update architecture.md" (ADR 0011/0015); correct `lib/product` to the real layer names
- [ ] `conducks-debugging` — correct `lib/product` paths only; its tool names are already valid, leave them
- [ ] `conducks-governance` — drop the dead `blueprint_gen` probe; the SKILL stays (guidance ships as skills)

## Phase 3 — Tool-count truth + the enforcing test (sequential, after Phase 2)
- [ ] `server.ts:65` — derive the count from the registered list; delete `MANDATED_TOOL_COUNT` (asserted 13; ADR 0006 said 12; CONDUCKS-9 says 9; reality is 14)
- [ ] Rewrite `CONDUCKS-9` to state the rule (registered in one place, count derived), not a number
- [ ] Add the ADR 0018 §4 test: every `conducks_*` named in `src/resources/skills/*.md` must exist in the registered surface
- [ ] Remove `generateBlueprint()` (`conducks-core.ts:356`) ONLY after zero callers is proven twice — it is a public method on an exported singleton advertising a capability ADR 0011 banned
- [ ] `npm run build` so the shipped `build/src/resources/skills/` copy is current
- NOTE: there is no `blueprint_gen` MCP tool to remove — verified absent from every `.ts`. Only skill references were stale.

## Phase 4 — conducks/ docs re-examination (parallel, one agent per area)
- [ ] `features.md` — verify all 50 capabilities against the code; name the command in each heading; add the `## Tunables` table; a capability that does not exist is removed per "a doc never outranks the code", never on "could not find it"
- [ ] `memory.md` (30 entries) — verify each against current code; delete what a convention now prevents; promote what became a rule
- [ ] `conventions.md` — verify each CONDUCKS-N against the code it claims to bind (coordinate: Phase 3 owns CONDUCKS-9)
- [ ] `architecture/` (20 MODULE.md) — confirm none carries a symbol map or a capability catalogue; confirm each states Boundaries and Deferred
- [ ] `decisions/` (18 ADRs) — confirm every accepted ADR's durable consequence has been promoted into a living doc; file specs for the ones that have not
- [ ] Root `README.md` + `docs/README.md` — re-verify every claim and command against the code

## Phase 5 — website/ repo (parallel with Phase 4, different repo, zero shared files)
- [ ] Delete the generated `website/ARCHITECTURE.md` (untracked, stale 2026-07-17, banned by ADR 0011)
- [ ] Bootstrap the missing governed files: `docs/README.md`, `docs/features.md`, `docs/progress.md`
- [ ] Resolve stale `docs/implementation.md` — promote anything live, then retire it
- [ ] Move `product_plan.md` + `styling.md` into soft folders (`product/`, `design/`)
- [ ] Verify `docs/architecture.md`, `conventions.md`, `memory.md`, `handover.md` against the code — all are thin (10, 6, 23 lines) and unverified since July
- [ ] Delete the empty `CONDUCKS/docs/` shell — zero files, and it implies a monorepo root that does not exist

## Phase 6 — Gate and close (sequential, main thread only)
- [ ] `docs-lint` clean · typecheck 0 errors · full suite green · `conducks audit` on conducks still clean
- [ ] Re-run the Phase 3 skills↔tools test as the final gate
- [ ] Rewrite `handover.md` (overwrite, re-stamp) and add one `progress.md` entry per repo
- [ ] Commit per phase; no push
