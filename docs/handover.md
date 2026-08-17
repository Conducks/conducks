# Handover — 2026-08-17
Status: current

## Where it stands
Gates green: **2,319 tests / 287 suites**, build clean, `docs-lint` 194 governed docs, `visuals-lint`
169 anchors with **56 review stamps all current**, drift clean, and all four oracles passing
(`tsc`, `exports`, `packs`, `python`). Branch `mcp-surface-walk-and-concurrency`.

The ADR 0150 campaign is finished — twenty doors, every layer. todo31 and todo66 closed today
(ADR 0152, ADR 0153); the fallback detector was removed (ADR 0151) after measuring 0 detections
across 7,220 functions on three codebases.

## Next, in order
1. **todo16 — npm publish.** The only open todo. Irreversible and spends the package name, so it is
   the owner's to run.
2. Branch coverage sits at **51.98%** across `src`. It has never been a target that was hit; it moves
   where defects are being fixed. `linker-intra` and the TypeScript resolver were raised this week.
3. Coverage cannot see across a process boundary: 42/42 CLI commands are driven by tests and jest
   reads 0% for them. Do not read those zeros as untested.
