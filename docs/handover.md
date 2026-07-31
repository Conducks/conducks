# Handover — 2026-07-31
Status: current

## Where it stands
Gates green: 751 tests / 90 suites, typecheck, `docs-lint` (72 docs), `audit` clean, `guard` on a real baseline.
Vault on its own source: 3,850 nodes, 12,813 edges — 0 self-parents, 1 root, 0 dangling sources, 218 dangling targets (all high-confidence findings, ADR 0055).
Pulse is 33.6 s, down from 57 s: ADR 0061 found 86% of "parse" was git subprocesses and 0.14% was tree-sitter.
Every ADR carries a build link or an `- Enforced by:`.
**Never released** — `doctor` reports 0.7.7, no release published. todo16 is blocked on two publish steps deliberately left to a human.

## Next, in order
1. `todo21#P12` — the rest of the parse cost: cache `createQuery` per language (~13.5%), then one repo-wide `git log` (~37%).
2. `todo26` — 500 UNIT nodes carry no fingerprint and 330 file-backed nodes no `unitId`; todo4 claimed this done and was never checked.
3. `todo20` — git identity, 23 open and 0 done, the largest unstarted capability. Begin at its Phase 0 measurements.
4. Release, or `todo07` (run conducks on the other repos). Both surface things this single vault cannot.
