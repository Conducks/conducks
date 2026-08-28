# Handover — 2026-08-29
Status: current

## Where it stands
Gates green: **2,469 tests / 319 suites**, build clean, `docs-lint` 234 docs, `visuals-lint` 235
anchors across 82 pages, drift clean. `npm run gate` = build + suite + 3 benchmarks + 36 oracle runs
over four subjects.

todo77 (ADR 0160) has closed four phases. `prune`, `trace` and `context` are proved at L1/L2/L3 with a
benchmark and an oracle each; `analyze` is scored on all five of its claims, including 0 misplaced of
40,126 `CALLS` edges. Seven prune defects fixed (ADR 0161–0167). Full record: `list.md` at the repo
parent, and `docs/todos/todo77.md`.

Today also: the canvas gained **Band 5**, which draws the proving apparatus itself; four module-note
sentences were false while every anchor in them resolved, and are corrected; and both skills were
updated from this repo after an audit found they named 7 shared visuals files where 9 ship.

## Next, in order
1. **todo77 Phase 4 — `entry`, then `flows`.** Both at `base(2)`/`base(3)`: sampled, never scored.
2. **Nine grammars have no subject.** Concrete since today: 9 of prune's 10 orphans here are every Rust
   `#[test]` in `plugins/checklist/` (`problems.html` p4). Fix the capture only once Rust has a subject.
3. **todo16 — npm publish.** Owner's to run: irreversible, spends the package name.
4. The 42 wildcard re-export misses on the sofie exports oracle are declined — the fix was measured and
   made it worse (ADR 0187). Do not re-open without new evidence.
