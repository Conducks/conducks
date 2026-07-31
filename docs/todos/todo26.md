# todo26 — the structural DNA columns todo4 declared finished
Status: doing
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
- [>] A query for a non-exempt node missing any of the three returning zero rows on this repo AND mentorseed — deferred: the 159 no-provider UNIT rows are produced by graph-skeleton-builder.ts and graph-engine.ts, neither owned by this change (edit nothing outside the OWNED FILES list per RULES.md §1); mentorseed was not measured at all, no access to that repo from this run

## Phase 2 — the claim cannot go unchecked again
- Depends: todo26#P1
- Builds: 0064
- [x] `drift` must not treat an ABSENT fingerprint as an unchanged one — fixed in drift-engine.ts: each delta now carries `identityGap` (true when either side's fingerprint is null), the velocity filter no longer drops a gap row, and summary/message name the count instead of folding it into "stable" — proven red-then-green in tests/unit/domain/evolution/fingerprint-coverage.test.ts
- [ ] todo4's real failure was not the missing columns; it was that a file declaring itself done sat in `completed/`, unscanned, for months with six unverified assertions in it. Add the vault assertion to the integration suite that already checks pulse output, so the acceptance is machine-checked rather than restated
- [ ] Fixed when deliberately nulling one column on one node makes the suite go red

## Phase 3 — what the review found after Phase 0 landed
- Builds: 0064
- [x] MY OWN COUNTS WERE WRONG and Phase 0's re-measurement corrected them. The "670 file-backed nodes missing fingerprint" in this todo's Context included 166 synthetic containers that carry a `file` value but are not source files — 125 `directory::`, 33 `ecosystem::`, 7 `taxonomy::`, 1 `repository::`. Excluding those: 499 real-path nodes, of which 494 are UNIT (exempt by ADR 0064) and **5 are genuinely broken symbols** — 4 BEHAVIOR + 1 ATOM. The claim "136 BEHAVIOR and 20 STRUCTURE" was those same synthetic and induced-external nodes counted as real
- [x] The "drift is blind for 21% of history" figure is NUMERICALLY correct and MATERIALLY misleading, and the correction matters more than the number. Of 815 fingerprint-less history rows: 131 induced `external://` library symbols (no source, so no fingerprint is right), 169 synthetic containers, 494 UNIT files (exempt by design), and 5 real symbols. The genuine defect was 5 nodes, all now fixed. Verified by joining `node_history` to `nodes` and bucketing by origin
- [ ] `decay_count` may have been inflated as a side effect. `drift-engine.ts:154` computes it as `deltas.filter(d => d.velocity > 0).length`, and Phase 1 added `|| d.identityGap` to the filter that builds `deltas` — so ~815 gap rows now survive into `deltas` and any with a non-zero gravity delta are counted as decaying. UNMEASURED: the before/after value was not captured, so this is a reasoned risk, not a demonstrated one. Fixed when `decay_count` is measured with and without gap rows and either excludes them or states why it should not
- [ ] PRE-EXISTING, found while verifying: `drift` reports two different counts for one word in one screen — "Structural decay in 3 of 3845 symbols compared" uses `velocity > 0.05` (drift-engine.ts:138) while "Decaying: 153" uses `velocity > 0` (drift-engine.ts:154). Two thresholds, one label, no way for a reader to know which is meant. Fixed when one definition of decaying is used, or the two are named differently
