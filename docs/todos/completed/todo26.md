# todo26 — the structural DNA columns todo4 declared finished
Status: done
- Acceptance: `conducks drift` can see every node a pulse wrote — no node-history row is excluded from move detection or shift detection by a missing `fingerprint`, and the nodes that legitimately have none are excluded by a stated rule rather than by being absent.

## Context

This is promoted work, not new work. `docs/todos/completed/todo4.md` — "Universal Structural DNA
Schema Reshape" — carried the line `**Status: DONE — Reshape Fully Reflected 🏺 ✅**` and sat in
`completed/`, which `docs-lint` and `docs-status` do not scan. Its acceptance criteria were written
as checkboxes and never ticked, and nothing has ever evaluated them.

Checked against the live vault on 2026-07-31, four of its six claims are false:

| todo4 claimed | measured |
|---|---|
| all nodes have `parentId` | true — 0 violations |
| `layer_path` is lowercase | true — 0 violations |
| all nodes have `unitId` | **480 NULL** |
| all nodes have `namespaceId` | **484 NULL** |
| `layer_path` populated for every node | **484 NULL or empty** |
| `fingerprint` populated for every node | **820 NULL or empty** |

Some of those are legitimate — a DIRECTORY, ECOSYSTEM or REPOSITORY node has no source file, so it
has no unit and no fingerprint to compute. That is why the acceptance line above says "comes from a
real source file" rather than repeating todo4's "every node", which was never achievable as written.

Restricting to nodes with a real file path, the gap is still real:

| | count |
|---|---|
| file-backed nodes with no `fingerprint` | **670** |
| file-backed nodes with no `unitId` | **330** |
| file-backed nodes with no `layer_path` | **334** |

Broken out by kind, the missing fingerprints are **500 UNIT**, 136 BEHAVIOR and 20 STRUCTURE — files
and real symbols, not synthetic containers.

The three pre-grammar todo files (`todo2`, `todo3`, `todo4`) were moved to `docs/legacy/` in the same
change. They predate the line grammar entirely — no `# Title`, no `Status:`, no `- Acceptance:`, no
`## Phase N`, with state encoded in bold text and emoji, which §5.3 of the standard says is never
read. They cannot be linted and will not be rewritten; this todo is the part of them that was still
owed.

### What this actually costs — measured 2026-07-31

A missing `fingerprint` is not a cosmetic NULL. It is the join key `drift-engine.ts` uses, and
**3,273 of 15,374 `node_history` rows (21%) do not have one.** Two consequences, both silent:

| line | code | what a NULL does |
|---|---|---|
| `drift-engine.ts:57` | `JOIN node_history p ON c.fingerprint = p.fingerprint` | SQL `NULL = NULL` is FALSE, so these rows can never match. Move and rename detection is blind for a fifth of history |
| `drift-engine.ts:86` | `isShifted = row.current_fingerprint !== row.prev_fingerprint` | JS `null !== null` is FALSE, so a node with no fingerprint always reports NOT shifted — a changed symbol reads as stable |

Both fail toward the reassuring answer, which is the ADR 0044 class exactly: a check that cannot see
its subject reports that nothing is wrong. `drift` has been in this family before, and this is a
second, independent path to the same lie.

The incremental parse gate is NOT affected — it keys on `FileHashGate.hash(file.source)`, not on
`fingerprint`. That was checked rather than assumed.

## Phase 0 — decide which nodes are exempt, before fixing anything
- Builds: 0064
- [x] Decided: a UNIT is exempt from `fingerprint` — reflector.ts's unitNode has never included the field, in either code path, for any file (494/494 UNIT nodes in this vault, 100%, not a partial gap) — the hash's inputs (name + dna) describe a symbol's structural identity, and a file has neither; see ADR 0064
- [x] Decided: `unitId` on a UNIT node's own row is `null`, matching persistence.ts:531's documented rule and purgeUnits' logic — reflector.ts's native unitNode set `unitId: fileId` (itself), the same self-loop shape ADR 0056 fixed for `parentId` on a different column, fixed in reflector.ts (see ADR 0064; graph-engine.ts still overrides this downstream — reported blocked, not owned)
- [x] Rule written: UNIT/DIRECTORY/ECOSYSTEM/REPOSITORY/PACKAGE are exempt from `fingerprint` (no structural identity to hash); no canonicalKind is exempt from `unitId` or `layer_path` — the 159 UNIT rows missing both are files with no language provider, reported blocked below, not exempt

## Phase 1 — the columns that are genuinely missing
- Depends: todo26#P0
- Builds: 0064
- [x] Re-measured against the live vault with taxonomy/ecosystem/external:// noise excluded (the 670/330/334 counts included those as false "file-backed" nodes): real gaps were 494 UNIT missing fingerprint (exempt, Phase 0), 4 route/request virtual BEHAVIOR + 1 Gnosis-fallback ATOM missing fingerprint (not exempt — fixed in reflector.ts), 159 UNIT missing unitId/layer_path (no language provider — blocked, see below)
- [x] DONE, and the reclassification was WRONG — reading the field settled it the other way. `layer_path` is `path.relative(projectRoot, file)` lowercased: a PATH, with no language content at all, so a markdown file has one for the same reason a TypeScript file does. It was simply never set outside the reflector, which never runs for a file with no provider. `graph-skeleton-builder.ts` now sets it for every unit. MEASURED after a clean re-analyze: units with no `layer_path` **172 -> 0** (one remains, `taxonomy::l3`, a legend node describing the UNIT kind rather than being a file). Original: RECLASSIFIED from deferred work to a decision, 2026-07-31. RE-MEASURED: 172 rows now, not 159 — 141 `.md`, 9 `.mjs`, 6 `.cjs`, 4 `.json`, 3 extensionless dotfiles, 2 `.html`, and singles of `.yml`/`.css`/`.txt`/`.npmrc`/`.gitignore`/`.conducksignore`. Every one is a file with no language provider BY DESIGN, so the fix is almost certainly a stated exemption rule and not a provider invented to give a changelog a `layer_path`. That is the same shape as ADR 0064's fingerprint exemption for UNIT nodes. Fixed when a written rule says which columns a no-provider file is exempt from and why, and a query for a NON-exempt file missing them returns zero

## Phase 2 — the claim cannot go unchecked again
- Depends: todo26#P1
- Builds: 0064
- [x] `drift` must not treat an ABSENT fingerprint as an unchanged one — fixed in drift-engine.ts: each delta now carries `identityGap` (true when either side's fingerprint is null), the velocity filter no longer drops a gap row, and summary/message name the count instead of folding it into "stable" — proven red-then-green in tests/unit/domain/evolution/fingerprint-coverage.test.ts
- [x] DONE — the vault assertion is in `tests/integration/features/pulse-writes-every-table.test.ts` beside ADR 0056's self-parent check, asserting `nodes WHERE unitId = id` is 0 on the PERSISTED result rather than on either writer. Original: todo4's real failure was not the missing columns; it was that a file declaring itself done sat in `completed/`, unscanned, for months with six unverified assertions in it. Add the vault assertion to the integration suite that already checks pulse output, so the acceptance is machine-checked rather than restated
- [x] PROVEN RED FIRST: reverting the one line in `graph-engine.ts` and rerunning gave `Expected: 0, Received: 3` on the fixture project; restored, 13/13 green

## Phase 3 — what the review found after Phase 0 landed
- Builds: 0064
- [x] MY OWN COUNTS WERE WRONG and Phase 0's re-measurement corrected them. The "670 file-backed nodes missing fingerprint" in this todo's Context included 166 synthetic containers that carry a `file` value but are not source files — 125 `directory::`, 33 `ecosystem::`, 7 `taxonomy::`, 1 `repository::`. Excluding those: 499 real-path nodes, of which 494 are UNIT (exempt by ADR 0064) and **5 are genuinely broken symbols** — 4 BEHAVIOR + 1 ATOM. The claim "136 BEHAVIOR and 20 STRUCTURE" was those same synthetic and induced-external nodes counted as real
- [x] The "drift is blind for 21% of history" figure is NUMERICALLY correct and MATERIALLY misleading, and the correction matters more than the number. Of 815 fingerprint-less history rows: 131 induced `external://` library symbols (no source, so no fingerprint is right), 169 synthetic containers, 494 UNIT files (exempt by design), and 5 real symbols. The genuine defect was 5 nodes, all now fixed. Verified by joining `node_history` to `nodes` and bucketing by origin
- [x] MEASURED 2026-07-31, risk not observed in current data: `decay_count` (velocity > 0, gap rows included per drift-engine.ts:154) = 0; recomputed excluding gap rows (`velocity > 0 && !identityGap`) = 0 — identical, no inflation. Cause: today's comparison has 829 `identityGap` rows in `deltas` out of 3931 symbols, and none of them carries a non-zero gravity/complexity delta, so `velocity` is 0 for every gap row and none crosses the `> 0` filter. This clears the risk for the current vault state, not structurally — a future pulse where a gap row's gravity DOES move would still inflate `decay_count`, since the code has no guard excluding `identityGap` rows from the count (only from the `> 0.05` "Structural decay in N of M" message would need the same check, and does not have it either). Original: `decay_count` may have been inflated as a side effect of Phase 1's `|| d.identityGap` filter change
- [x] FIXED. One `DECAY_VELOCITY_THRESHOLD` constant now serves all THREE comparisons — the test caught a third literal at drift-engine.ts:139 (the DECAYING verdict itself) that I had missed when I found the first two. Original: PRE-EXISTING, found while verifying: `drift` reports two different counts for one word in one screen — "Structural decay in N of M symbols compared" uses `velocity > 0.05` (drift-engine.ts:138) while "Decaying: N" uses `velocity > 0` (drift-engine.ts:154). Two thresholds, one label, no way for a reader to know which is meant. Fixed when one definition of decaying is used, or the two are named differently — RE-VERIFIED 2026-07-31, both lines still present exactly as described at 138/154; today's two numbers happen to read identically (0 and 0, since no symbol has non-zero velocity in this pulse pair) so the split is currently invisible in output but the code divergence is unchanged

## Phase 4 — the fix was inert until the writer that overwrote it was found
- Builds: 0064
- [x] Phase 1 fixed `reflector.ts` to emit `unitId: null` for a UNIT node and NOTHING CHANGED IN THE VAULT — 337 UNIT nodes still carried `unitId = id` after a full re-analyze. Agent C reported this as a blocked finding rather than claiming the fix worked, which is the only reason it was caught
- [x] `graph-engine.ts:305` wrote `unitId: unitId || null`, and the `unitId` parameter IS the file's own id, so the spread overwrote whatever the reflector emitted. The guard two lines above it — `parentId === nodeId ? null : …` — is ADR 0056's fix for exactly this shape on the neighbouring column, added without anyone checking whether `unitId` had the same defect. It did
- [x] MEASURED after a clean re-analyze: UNIT nodes with `unitId = id` **337 -> 0**, all 510 now NULL, self-parents still 0, still exactly one root
- [x] The lesson is the one this todo already carries: a fix at the source proves nothing until the persisted result is checked. todo4 declared six acceptance claims and nobody ran them; Phase 1 fixed a writer and nobody re-queried the vault. Both are the same omission
