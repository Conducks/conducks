# todo28 — the MCP surface: two dead modes, one unusable tool, and half a graph of noise
Status: doing
- Acceptance: every mode an MCP tool advertises does what its description says, no tool can return a response the transport must reject, and a context request spends its token budget on symbols rather than local variables.

## Context

All 14 MCP tools were exercised on 2026-07-31 against a **freshly spawned server on that day's
build**, over real JSON-RPC. The first pass was run against the server the session had been using
and was invalid: three servers were running, the oldest started 2026-07-30 18:34, and all of them
predated ADRs 0059, 0060 and 0061. That server reported a `path.dirname -> path.join ->
path.resolve` cycle ADR 0059 had already removed. **A fresh server reports 0 cycles.** The tools
below are judged only on the fresh run.

Latency is not a problem anywhere: 6 ms to 267 ms across the whole surface.

Four tools are genuinely strong and want no work here — `docs` (the whole board in 18 ms, needing no
vault), `graph_query`, `prune`, `impact`, plus `status --mode map`.

## Phase 1 — modes that do not do what they say
- [x] `conducks_status --mode manifest` returns the `health` payload BYTE FOR BYTE. Verified by comparing the two responses for equality: identical. The enum accepts `manifest`, the description promises "an LLM-optimized technical summary of the codebase", and the handler branches only on `map` and `pulse` — so `manifest` falls through to the health return. Same class as `AuditResult.status` declaring `INSUFFICIENT_DATA` and never returning it (todo22#P3): a declared capability that is absent, failing toward a plausible answer
- [x] Decided: implement it — see ADR 0063. It composes `registry.audit.audit()` (violations), `hotspots`/`entry_points` templates and `status.stats`/`staleness` into one onboarding digest, the same capabilities `conducks_audit`/`conducks_status --mode map`/`health` already expose in this file, rather than removing a capability a real composition could satisfy
- [x] Fixed: `manifest` now returns hotspots/entryPoints/a violations summary that `health` carries none of — verified via `JSON.stringify` inequality plus field-level assertions in tests/unit/interfaces/tools/mcp-surface.test.ts (8/8 passing, 6/8 red against the unfixed handler)

## Phase 2 — a tool that cannot be called over MCP
- [x] `conducks_coverage` returned **213,106 characters / 680 functions** and the transport rejected it outright. It has no `limit` parameter, unlike `query`, `prune` and `flows`, and no token budget, unlike `context`. On any project larger than this one it is strictly unusable. Reproduced 2026-07-31 via a fresh stdio JSON-RPC call against build/ (`node build/src/interfaces/cli/index.js mcp`), matching the number in this task exactly
- [x] It reported `meta.truncated: false` on that response. The field is not merely unhelpful, it is false — the answer WAS cut off, by the transport rather than by the tool. Every other tool sets this honestly. Fixed: `meta.truncated` is now `shown.length < bound.length`
- [x] Fixed: added `limit` (default 75, max 500). Measured against the 680-function baseline by slicing the real 680-row response at N=30..100 through the tool's own `JSON.stringify(res, null, 2)` formatter — 75 -> 23,279 chars, 80 -> 24,832 chars (too close to the 25,000 ceiling), so 75 was chosen for margin. `summary` still counts the full 680/1/369 baseline; only `functions` is capped

## Phase 3 — trace does not return a trace
- [ ] `conducks_trace --mode execution` on `AnalysisService.analyze` returned 10 "steps" including `global::promise`, `global::process` and `fs.stat`, with `synapsepersistence.beginpulse` LAST — it runs first. The result is an unordered neighbour set presented as execution order
- [ ] conducks-docs §6.13 makes exactly this distinction: `conducks trace` verifies wiring, never logic. The tool's own `mode: "execution"` claims the thing the standard says it cannot do
- [ ] Decide: order the steps by something defensible, or rename the mode to what it returns. Fixed when either the first step is the first thing that runs, or no mode claims execution order

## Phase 4 — half the graph is local variables, and the agent-facing tools return them
- [ ] MEASURED: **1,961 of 3,845 nodes (51%) are ATOM** — locals like `unitId`, `srcNode`, `abs`, `list`. `conducks_context` with a 1,500-token budget returned 19 nodes of which **10 were ATOMs (53%)**, so more than half the budget went to local variable names
- [ ] **0 of those 19 nodes carried a line number.** Repo-wide, 152 of 1,224 BEHAVIOR/STRUCTURE nodes have none. An answer a caller cannot jump to costs a grep on top of the call that was supposed to replace it
- [ ] Node ids average **127 characters** (max 185) — roughly 32 tokens each before any information, and an id is the required input to `trace`, `impact`, `explain` and `context`, so a caller must first spend a `query` to obtain one
- [ ] These three compound: the tools that take an id and return neighbours are the ones where the noise, the missing line numbers and the id cost all land at once. Decide whether ATOMs are excluded from the agent-facing tools by default, whether ids can be repo-relative, and whether `file:line` is mandatory on every returned symbol
- [ ] Fixed when a `context` call on the same symbol and budget returns no ATOM unless asked, and every returned symbol carries a line
