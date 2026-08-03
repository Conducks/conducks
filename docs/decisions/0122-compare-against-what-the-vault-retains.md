# 0122 — compare against what the vault retains, and record what was asked

Status: Accepted
- Date: 2026-08-03
- Builds: 0116, 0119
- Enforced by: tests/integration/features/diff-command.test.ts (5) and tests/integration/features/record-command.test.ts (5) — run against the unfixed build first, 5 of 5 and 4 of 5 failed, the fifth being a control

## Context

Phase 2 of the todo37 sweep: `diff`, `drift`, `ledger`, `record`, `fallback`, `supply-chain`.

**`diff --base` compared against a pulse the vault no longer holds.** The chronoscopic path queried
`SELECT * FROM nodes WHERE pulseId = ?`, but `sweepRowsNotInPulse` deletes every row not written by
the CURRENT pulse. Measured on conducks, comparing two real pulses three minutes apart:

```
[DEBUG] Loaded Base: 0 nodes, 0 edges
Summary: Delta: +5472/-0 Symbols, +19675/-0 Relationships.
```

"Your entire codebase was added." A pulse id that **does not exist** produced the identical answer at
exit 0, so nothing distinguished a real comparison from a fabricated one. The `[DEBUG]` lines were
shipped output. `reconstitute()` also read `row.label` and `row.filePath`, columns the `nodes` table
does not have — it stores `canonicalKind` and `file` — so even a populated base would have been
nameless and kindless.

**`record` wrote the wrong content to the wrong file and reported success.** Four defects,
compounding:

| measured | cause |
|---|---|
| `record "a note" --type conventions` → *"✅ Recorded in docs/memory.md"* | `--type` was read only as `--type=x`, or as `args[1]` when `--type` was `args[0]` |
| the file then contained the word `conventions` | content was `args[args.length - 1]` — the FLAG VALUE, so the note was discarded |
| `--type=nonsensetype` → `docs/nonsensetype.md` | no validation against the seven documented types |
| every file it created failed `conducks docs-lint` | *"missing `# Title`"* |

The last one is the sharpest. `computeRecord` builds an `initialContent` carrying the title, and
`record()` reached it only in the `catch` of an `appendFile` — but **`appendFile` creates a missing
file**, so it never threw and the branch was unreachable. The header was written, reviewed, and could
never run.

## Decision

**`diff --base` reads `node_history`**, which is the table that actually keeps per-pulse rows
(pulseId, nodeId, gravity, complexity, fingerprint). Names are joined from `nodes` where the symbol
still exists. A pulse the vault does not hold is refused **by name, listing the ones it does hold**.

**Edge history is not retained, so relationship deltas are not reported.** The output says so —
`"Relationship deltas are not shown: the vault keeps no edge history"` — and the JSON carries a
`retains` field. Stating the limit beats inventing the number, which is what `+19675` was.

**The git path uses `git diff HEAD`.** The bare form shows unstaged changes only, so a fully staged
change set reported "No structural changes detected" while the command's own description says
"staged/unstaged".

**`record` reads `--type` anywhere, in either form; takes the note from the first positional; refuses
a type outside the documented seven; and writes a titled file.** `--head` without `--base` is refused
rather than silently running the git path.

**`supply-chain --json` now exists.** It was advertised and did not — and that one is mine: ADR 0119
derived each command's flag set with a regex over its source, and here the pattern matched
`json_extract_string(...)` in a SQL string rather than a flag read.

## Consequences

- `diff --base <real pulse>` reports **+16 / -0 symbols** where it reported **+5472 / -0**.
- **Two predictions written before running were wrong**, and both are recorded as wrong: `ledger`'s
  dead-weight deduction does fire (`prune` emits `ORPHAN`, 9 of them, `-18` points), and `record`'s
  root anchoring was already correct in effect. Writing predictions down is only worth it if the
  misses are kept.
- **A dead fallback is worse than no fallback.** The `initialContent` branch existed, looked correct,
  and could not execute. Worth grepping for other `try { append } catch { create }` shapes.
- `drift` on an unknown pulse says *"no drift verdict was reached"* and exits **0**. Recorded, not
  fixed here: it is informational rather than a gate, and changing its exit code needs its own call.
- No regression: **1,428 tests green**.
