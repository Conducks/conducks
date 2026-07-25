# conducks — docs

**State:** Structural pulse, taxonomy (System 1) and boundary classification (System 2) all ship;
`conducks audit` is clean and the ADR 0005 layer contract is ENFORCED — `conducks guard` hard-blocks
upward edges (since 2026-07-25, after routing 74 illegal edges through composition). Java, PHP and
Swift extraction revived the same day; Java and Swift emit the graph's first EXTENDS/IMPLEMENTS
edges. Known holes: TS/TSX/Go still record no inheritance edges, which blocks STALE_IMPORT (todo11 —
the Java co-capture recipe is the fix). Workspace rollout not started (todo07).

**Read in order:** `handover.md` → `todos/` (active) → `memory.md`

Docs here hold **authored intent only**. How the code is WIRED is never written down — query it:
`conducks audit` · `conducks impact <sym>` · `conducks trace <sym>` · `conducks coverage`.
Follows the **conducks-docs** standard.

| doc | holds |
|---|---|
| `handover.md` | where it stands + what's next — first thing a new session reads |
| `features.md` | what each capability is FOR and why, plus the tunables table |
| `conventions.md` | binding rules (`CONDUCKS-N`), each with its reason |
| `memory.md` | gotchas the code can't show — traps, not rules |
| `architecture/` | authored per-module intent: `README.md` (layer contract + index) + 20 `MODULE.md` |
| `decisions/` | 18 ADRs, immutable; status index in `decisions/README.md` |
| `todos/` | `todoNN.md` active · `completed/` closed (not context — facts get promoted out) |
| `progress.md` | dated log of what shipped, newest first |

Soft docs — `business/` `brand/` `product/` `design/` — free-form, never linted.
