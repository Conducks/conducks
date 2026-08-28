# Handover — 2026-08-29
Status: current

## Where it stands
Gates green: **2,469 tests / 319 suites**, build clean, `docs-lint` 234 governed docs, `visuals-lint`
235 anchors across 82 pages, drift clean. `npm run gate` runs the build, the suite, three benchmarks
and 36 oracle runs over four subjects.

The todo77 verification campaign (ADR 0160) has closed four phases. `prune`, `trace` and `context` are
proved at L1/L2/L3 with a benchmark and an oracle each; `analyze` — the graph every other tool reads —
is scored on all five of its claims, including 0 misplaced of 40,126 `CALLS` edges. Seven defects were
fixed in prune alone (ADR 0161–0167). The canvas gained Band 5, which draws the proving apparatus
itself. Full record: `list.md` at the repo parent, and `docs/todos/todo77.md`.

## Next, in order
1. **todo77 Phase 4 — `entry`, then `flows`.** Both sit at `base(2)`/`base(3)`: a sampled answer, never
   scored. Same method as the four already done.
2. **Nine grammars have no subject** — `c cpp csharp go java php ruby rust swift`. This stopped being
   hypothetical on 2026-08-29: prune reports 9 orphans on this repo that are every Rust `#[test]` in
   `plugins/checklist/`, a false-positive class the four scored languages do not have (`problems.html`
   p4). Fix the capture only once Rust has a subject to score it against.
3. **todo16 — npm publish.** Still open, still the owner's to run: irreversible, and it spends the
   package name.
4. The 42 wildcard re-export misses on the sofie exports oracle are explained and declined; the fix was
   measured and made things worse (ADR 0187). Do not re-open it without new evidence.
