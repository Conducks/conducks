# todo26 — the structural DNA columns todo4 declared finished
Status: todo
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
- [ ] `fingerprint` is documented as a hash of structural identity, and 500 UNIT nodes do not have one. Establish whether a UNIT is SUPPOSED to carry a fingerprint or whether only symbols are — the answer decides whether 500 is a bug or the design, and every count below depends on it
- [ ] Same question for `unitId` on a UNIT node: a file's own `unitId` is either itself or null, and ADR 0056 already had to stop `parentId` being self-referential for exactly this shape. Decide which, and say so in the type
- [ ] No threshold is set here and none is invented: this measurement sets the exempt list. Fixed when a written rule names each canonical kind that is exempt from each column, with the reason

## Phase 1 — the columns that are genuinely missing
- Depends: todo26#P0
- [ ] Populate the columns for every kind Phase 0 rules non-exempt. The counts to beat are 670 missing fingerprints, 330 missing `unitId` and 334 missing `layer_path` among file-backed nodes, re-measured after Phase 0 narrows the population
- [ ] Fixed when a query for a non-exempt node missing any of the three returns zero rows on this repository AND on `mentorseed`, and a test asserts it so the claim cannot rot the way todo4's did

## Phase 2 — the claim cannot go unchecked again
- Depends: todo26#P1
- [ ] todo4's real failure was not the missing columns; it was that a file declaring itself done sat in `completed/`, unscanned, for months with six unverified assertions in it. Add the vault assertion to the integration suite that already checks pulse output, so the acceptance is machine-checked rather than restated
- [ ] Fixed when deliberately nulling one column on one node makes the suite go red
- [ ] Separately, `drift` must not treat an ABSENT fingerprint as an unchanged one. Whatever Phase 0 rules exempt, a row that should have had a fingerprint and does not is a gap in the comparison, not a passing node — the same distinction ADR 0044 drew between STABLE and INSUFFICIENT_DATA. Fixed when a node-history row with a NULL fingerprint is reported rather than silently skipped
