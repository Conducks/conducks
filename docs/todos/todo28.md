# todo28 — the MCP surface: two dead modes, one unusable tool, and half a graph of noise
Status: todo
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
- [ ] `conducks_status --mode manifest` returns the `health` payload BYTE FOR BYTE. Verified by comparing the two responses for equality: identical. The enum accepts `manifest`, the description promises "an LLM-optimized technical summary of the codebase", and the handler branches only on `map` and `pulse` — so `manifest` falls through to the health return. Same class as `AuditResult.status` declaring `INSUFFICIENT_DATA` and never returning it (todo22#P3): a declared capability that is absent, failing toward a plausible answer
- [ ] Decide: implement it, or remove it from the enum and the description. A mode that silently answers a different question is worse than a missing one, because the caller cannot tell
- [ ] Fixed when either `manifest` returns something `health` does not, or the enum no longer offers it — and a test asserts the two responses differ

## Phase 2 — a tool that cannot be called over MCP
- [ ] `conducks_coverage` returned **213,106 characters / 680 functions** and the transport rejected it outright. It has no `limit` parameter, unlike `query`, `prune` and `flows`, and no token budget, unlike `context`. On any project larger than this one it is strictly unusable
- [ ] It reported `meta.truncated: false` on that response. The field is not merely unhelpful, it is false — the answer WAS cut off, by the transport rather than by the tool. Every other tool sets this honestly
- [ ] Fixed when a coverage call on this repository returns under 25,000 characters by default, and `meta.truncated` is true whenever the full set was not returned. Verify against the 680-function baseline

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
