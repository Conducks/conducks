# todo09 — Taxonomy reconcile (C0) + tracked design debt
Status: todo
- Acceptance: on a real TS repo, ATOM drops from ~72% of nodes to a few hundred (edge-carrying only),
  DATA is gone as a node kind, node count falls ~5,000 → ~1,400, and coverage/audit/impact/query all
  still pass. Decision recorded in ADR 0013 (resolves ADR 0012).

## Phase 1 — cut DATA, edge-gate ATOM (the C0 fix that blocks everything)
- [ ] Stop emitting DATA nodes — parameters/arguments/literals become attributes/metadata on their parent, not graph nodes.
- [ ] Edge-gate ATOM: emit an ATOM node ONLY if it carries a real reference edge (exported const imported elsewhere, field accessed cross-scope); demote local-only vars/params to attributes on the parent BEHAVIOR/STRUCTURE.
- [ ] Re-route dropped atoms' edges to their parent node so no dependency is lost.
- [ ] Verify: fresh analyze on conducks + one external TS repo → ATOM count small, DATA=0, density healthy.

## Phase 2 — keep the features that read ATOM working on the surviving set
- [ ] dead-code/prune (`dead-code.ts:107`) — still finds unused *exported/referenced* atoms; the local-var false-positive flood (todo05) is gone by construction.
- [ ] query (`query-service.ts:439`) — "find a variable" now returns only meaningful (edge-carrying) atoms; confirm no crash on the smaller set.
- [ ] flow-engine + risk (`persistence.ts:366`) — confirm they behave on the reduced ATOM set.
- [ ] Regression: full test suite green; no feature silently loses data.

## Phase 3 — tracked design debt (recovered from chat, do not lose again)
- [ ] System 2 — boundary-node origin/version tagging: tag external targets stdlib(trust/no-version) vs dependency(versioned/supply-chain). "Edge classification, not node count, tells architecture health." (ADR 0012)
- [ ] WORKSPACE_LEDGER: workspace-level survey/grade doc (mentioned in the design, never built).
- [ ] (see todo01) live cross-service overlay / coverage click-through — deferred to a target-app project.
- [ ] EXPRESSION kind: stays dropped per ADR 0013 — this item is a marker, not work, unless a real query need appears.
