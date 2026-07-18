# todo07 — workspace rollout: run conducks on the drifting repos
Status: todo
- Acceptance: conducks analyze + drift + docs-status has run on each active workspace repo, and the drift ledger is live data (not a one-time swarm snapshot)

## Phase 1 — highest-rot repos first
- [ ] mycvpath — 212-file dormant Go agent framework; arch doc 5mo stale vs 776 changed files
- [ ] orchestrator — 483M legacy dir + 230M orphan datahub; docs describe a folder tree that no longer exists
- [ ] dual_chatbot — abandoned split-engine refactor left in tree next to the real engine
- [ ] unnamed-C-level — architecture.md describes a Turborepo that does not exist (frozen at scaffold day)

## Phase 2 — the rest of the active set
- [ ] assistant — features.md documents a subsystem that greps to zero (fresh timestamp, dead content)
- [ ] mentorseed · envoy-mail · growth-ops · Said-Foundation · medical_chatbot_2 · interview
- [ ] apply conducks-docs standard (derive architecture, author intent) per repo
- [ ] wire `conducks guard` into each so drift can't re-accumulate

## Phase 3 — cross-project
- [ ] a workspace-level drift ledger fed by each repo's conducks output (replaces the swarm snapshot)
- [ ] decide per repo: active / freeze / kill (shrink the active mental map to the ~6 that matter)
