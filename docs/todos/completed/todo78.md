# todo78 — make the visuals obey their own standard

Status: done

The `conducks-visuals` standard was rewritten on 2026-09-07: the canvas draws every feature as ONE box and zero internal steps, a contract renders as a substrate strip with no edges, and `references/design.md` now owns the stylesheet. The generator implements none of it, so this repository's own pages currently fail the standard it ships. This is that gap, closed.

- Acceptance: `npm run visuals` renders a canvas carrying zero blocks, the gate refuses one that does not, and `system.css` passes all nine checks in `references/design.md` §6 in both projects that hold it.
- Blocked by: nothing

## Phase 1 — the stylesheet

- [x] Re-token `system.css`: role names, both themes, zero raw hex outside `:root` — measured 2026-09-07: 12 tokens declared, then 29 distinct raw hex values and 3 raw rgba() written past them
- [x] Replace the borrowed palette — `#58a6ff` `#3fb950` `#f85149` `#d29922` are GitHub-dark's own accent, success, danger and attention, verbatim
- [x] Give the sheet a display face and a monotonic scale — today h3 is 14px against 15px body, and the only `font-family` declaration in 323 lines is the mono
- [x] Every state renders as a pill, legible with colour removed — `.y` `.n` `.c` are hue-only bold text today
- [x] Reconcile the fork with forgeterm — both copies are byte-identical again, at 492 lines

Phase 1 done 2026-09-07. Zero raw hex or `rgba()` past the token block, down from 29 and 3. 50 tokens declared, 48 used, every `var()` resolves and nothing is declared unused — checked by parsing the sheet, not by reading it. `--sofie` is gone: a product name in a file shared byte-for-byte across projects. Light and dark are the same names declared twice, plus a `[data-theme]` block so an explicit choice wins either way.

The display face is a stack, not a download — these pages open from disk and a webfont link would make headings depend on a network nothing else on the page needs. Vendor a face later and it becomes a real second family with no other edit.

## Phase 2 — the canvas altitude

- [x] Sort every container in `graph.mjs` into feature, util or contract, and record the census
- [x] Stop the canvas renderer drawing container children — the data does not change, `detail.mjs` already draws them
- [x] Draw a contract as the substrate strip: named, beneath the canvas, no edges
- [x] Each feature box states its boundary — what goes in, what comes out

## Phase 3 — the gate

- [x] Refuse a canvas carrying any block, by re-parsing the finished SVG, and refuse on an empty parse
- [x] Refuse an edge that touches the substrate strip
- [x] Mutation-test both refusals — a gate that cannot fail is a claim about the mutation

Phases 2 and 3 done 2026-09-07. The canvas went from **3,066 × 5,924 px and 74 blocks** to **1,390 × 1,873 px and 13 feature boxes**, average edge detour ×1.02 with nothing over ×2. Every one of the 74 blocks still exists, drawn on its feature's own page, and all 67 distinct anchors are still gated — the anchor count fell 239 → 166 because each block anchor had been counted twice, once on the canvas hover and once on its page, and the canvas no longer carries any.

Container-level edges are DERIVED from the block-level edges already in the data, so no second edge list exists to fall out of step. `c_seam` folded into `c_reg`: two containers both titled THE REGISTRY, which the substrate strip would have printed twice side by side.

Three mutations were run and the tree restored byte-identical after each. Two of them found real defects in the work rather than confirming it:

- Gate 10 as first written **could never fire**. A contract is not in the ELK graph, so an edge naming one killed the engine before the check — a 64 KB stack trace out of `elk-worker.min.js` naming a GWT internal, with nothing in it about the edge. Moved ahead of the engine, where it prints one line.
- Deriving the edges introduced a **silent drop**: an endpoint that names nothing resolved to `undefined` and the edge vanished with the build still printing `ELK OK`. Renaming one endpoint to `addd` removed a real edge from the picture and nothing said so. It refuses now. The engine used to crash on this — unreadable, but loud, and silence is the worse of the two.

## Phase 4 — the five containers that are not features

The census found five containers that are arguments rather than capabilities. They still render as feature boxes, so the canvas draws 13 where the census says 8.

- [x] Fold `c_oracle` and `c_gate` into `c_bench` — how the tool is proved is not a second capability beside the benchmark
- [x] Split `c_surf`: the command count belongs on `c_cli`, the tool count on `c_mcp`
- [x] Move `c_gap`'s four findings and `c_surf`'s ADR conflict to `problems.md` — each is a defect with evidence
- [x] Fold `c_git` into `c_parsing` — tagged `util` today and still drawn as a box
- [x] Give every surviving container a main-feature anchor — measured 2026-09-07: not one of the 15 carries one, which is the failure `references/anchoring.md` §1 names

Phase 4 done 2026-09-07. The canvas is **8 feature boxes and 2 contracts on the substrate strip**, 1,362 × 1,339 px, 7 derived edges, average detour ×1.01. It began this todo at 3,066 × 5,924 with 74 blocks.

Band 4 disappeared with its contents: both its containers were essays, so it held nothing once they left, and the proving band renumbered 5 → 4 rather than leaving the canvas printing 1, 2, 3, 5. Nothing in `docs/` referenced either id — checked before removing.

Five detail pages were orphaned by the fold and deleted. Their content is not lost: `c_oracle` and `c_gate` are the benchmark's own internals now, so `bench.html` carries 14 blocks; the command and tool counts moved onto `cli.html` and `mcp.html`; `c_git`'s four steps are the front of `parsing.html`, which is right, because discovery is what parsing consumes.

Two new problem entries carry what could not fold. **p5** is the paired-surfaces gate: `tests/architecture/paired-surfaces.test.ts:71` skips a tool whose CLI twin is missing, so it enforces that a pair MIRRORS and never that the pair EXISTS — and ADR 0007 and ADR 0148 disagree about whether the one gap it let through is deliberate, with 0148 never citing 0007. **p6** carries the three test-suite findings, including the one that is fixed and kept anyway: a barrel re-export still hides a dead symbol from `prune`, and nobody has sized how many.

All ten containers now carry a main-feature anchor, each one the feature's own door (ADR 0150). Gate 11 refuses a container without one — mutation-tested by deleting the graph feature's anchor, and the first attempt at that mutation silently failed to match, which is why the gate was not believed until the second.

The forgeterm reconciliation, done 2026-09-07. The first measurement of it was misleading and worth correcting: "66 differing lines" counted my own rewrite as drift. Comparing SELECTOR SETS rather than lines gave the real answer — forgeterm held **39 `.testpage` rules** conducks did not, and conducks held five forgeterm did not (the substrate strip, the state pills, the two theme blocks). Everything else that differed was the same rule before and after this todo touched it.

The 39 are the testing page's furniture. conducks ships the identical `testing.mjs` and has no `testing.md`, so it renders no testing page and never needed them — which is exactly the reasoning that produces a fork. A file holding only what the current project happens to render is not shared; it is a fork waiting for the day someone writes a `testing.md` and finds the page unstyled. Both copies carry the block now.

Four raw values came across with it and were tokenised on the way: `#0f1318`, `#c7a86b`, and `var(--bad,#d47b7b)` — a fallback for a `--bad` token that is defined nowhere, so the fallback was the only value it ever had.

Checked after the copy: the two files diff clean, every `var()` in the merged sheet resolves, no raw hex sits past the token block, and every class used by a forgeterm page still has a rule — `design.html` excluded, because a product mock paints its own tokens by design (`references/mock.md`).
