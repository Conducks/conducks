# conducks — docs

**State:** Structural pulse, taxonomy (System 1) and boundary classification (System 2) all ship;
`conducks audit` on conducks itself is clean. Known holes: the graph records no inheritance edges,
which blocks STALE_IMPORT (todo11); Java, PHP and Swift extraction is dead — their query files fail
to compile against the installed grammars, so those files silently degrade to the file-only Gnosis
fallback. Workspace rollout not started (todo07).

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
