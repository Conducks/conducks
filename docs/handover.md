# Handover — 2026-07-18
Status: current
- Scope: state after the conducks completion arc (coverage, docs-as-data, clean architecture, MCP surface) + full claim re-verification against the codebase

## Where the system stands (all verified against code this date)
- conducks tool COMPLETE for its core loop: analyze → derived docs → coverage overlay → drift
  baseline → guard (layer contract + cycles + ranks, all clean, self-enforced)
- MCP: 14 tools incl. conducks_docs + conducks_coverage (ADR 0007); guidance ships as native
  skills (ADR 0006); CLI 39 commands; one shared domain implementation behind both surfaces
- Docs: 8 todos + 7 ADRs + features(48)/memory/conventions in the strict grammar; docs-lint clean

## The prioritized plan (next sessions, in order)
1. todo08 — fix coverage matchFile basename over-binding (small, correctness): one covered
   index.ts currently lights ALL 12 same-named files FULL. Drop the bare-basename fallback in
   coverage-bind.ts. Do FIRST — dark-counts are the drift signal the rollout reads.
2. todo07 Phase 1 — workspace rollout, worst rot first (claims re-verified exact this date):
   mycvpath (212-file dormant framework → integrate-or-delete+ADR), orchestrator (483M legacy
   + 230M datahub → decide+record), dual_chatbot (root orphans → delete+ADR), unnamed-C-level
   (regenerate architecture from code). Per repo: analyze → context-gen → coverage/drift →
   author intent → guard. ~1 focused session each.
3. todo07 Phase 3 — active/freeze/kill triage across the workspace; drift ledger becomes live.
4. todo01 C4 — node-anchored intent (author Nodes: anchors in features.md, build the
   dangling-anchor flag). C5-full (live click-through overlay) after rollout picks the target app.
5. Tails, opportunistically: todo05 Go ABI pin · todo04 LC7 runs · todo03 S7 auth / A1 god-object
   / Q1 (9 scratch files still git-tracked) / Q3+Q4 test restoration.
6. todo02 — re-scope before executing: drive the 90% coverage push from `conducks coverage`
   dark-lists, not the old plan ("19 templates" count unverified).

## Corrections made during re-verification (honesty trail)
- todo08 premise retracted (vault duplicates = false); real bug is the coverage matcher.
- todo01 stale items fixed (vault claim retracted; docs-rules-skill item was already done).
- memory.md gotcha corrected to the true cause.
