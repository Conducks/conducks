# Handover — 2026-07-19
Status: current

## Where it stands
- **Taxonomy reconcile (C0) done** — `pruneTaxonomy()` cuts DATA, edge-gates ATOM at pulse end. On
  conducks: ~5000→~1660 nodes, ATOM 3561→~230, DATA 0, density ~4.5. ADR 0013. (todo09 Phase 1+2)
- **Edge-resolution (Phase 3) mostly done** — method-call resolution, dead-code accuracy (dot-guard,
  fixture exclusion), reference-as-value + object-literal-value edges. `prune` 25→8 findings, all
  documented-benign. Registry getters + initUI left as reasoned won't-fix (recipe in todo09).
- **Edge-properties persist bug fixed** — `saveEdges` read `.metadata`/`.weight`; now `.properties`/
  `.confidence`. Every edge kept `{}` before. Unblocked System 2. (memory.md)
- **System 2 built (ADR 0014)** — `boundary-classifier.ts` classifies imports internal/stdlib/
  dependency; durable origin-tagged DEPENDS_ON edges. New commands: `conducks supply-chain` (surface +
  versions + phantom-dep detection) and `conducks ledger` (workspace survey + grade). conducks = B(88).
- **Docs standard fixed (ADR 0015)** — architecture is AUTHORED, not derived; `docs-grammar.ts` +
  the conducks-docs skill updated. Canonical standard now lives at
  `src/resources/skills/conducks-docs.md`; the `~/.claude` skill is generated from it by the installer.
- **Docs cleaned** — deleted `docs/legacy/` (26 superseded files) + stale `implementation.md`.
- Suite 48/48, typecheck clean, docs-lint clean. Pushed to `origin/main`.

## Next, in order
1. todo09 Phase 3 externally-blocked items: vuln surface (needs advisory DB / network), live
   cross-service overlay (needs a target app). EXPRESSION stays a no-op marker.
2. Optional: author `docs/architecture/*.MODULE.md` for the heavy modules (reflector, orchestrator,
   persistence, graph) now that authored architecture is a valid doc type.
3. Optional: re-verify the taxonomy + System 2 on one external TS repo (not just conducks itself).
