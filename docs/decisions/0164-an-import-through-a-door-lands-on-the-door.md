# 0164 — an import through a door lands on the door, not on the declaration
Status: Accepted
- Date: 2026-08-27
- Builds: 0163
- Enforced by: tests/integration/features/dead-import-laundering.test.ts

## Context

After ADR 0163, `prune` still missed 22 stale imports on this repository that `tsc --noUnusedLocals`
finds. Three hypotheses were tested against the oracle and all three were wrong:

| hypothesis | change | result |
|---|---|---|
| type imports are exempted by `isTypeOnly` | drop the shortcut | 23 → 23 |
| type aliases are excluded by the kind gate | add `type`, `typealias` | 23 → 23 |
| aliased imports are checked under the wrong spelling | carry the local name, check both | 23 → 23 |

The third was worth keeping until it was mutation-tested: it did not bite, and instrumenting the line
it was supposed to protect showed why. **The resolved target tail already carries the original
spelling** — a call through an alias binds to `<source>::originalname`, and the used-names index
records that tail. The guard was removed as dead code (Rule 8), and the test written for it stays,
because mutating the target-tail line fails that case and nothing else.

Instrumentation then named the real cause in one run:

```
[stale] call.ts conducksadjacencylist used=false target=…/graph/index.ts::conducksadjacencylist kind=binding
```

**`kind=binding`.** An import routed through a barrel resolves to the barrel's own re-export node —
a name that file republishes, not a declaration — and `binding` is not in `PRUNABLE_BINDING_KINDS`.
So no import reached through a door could ever be judged stale. On a codebase built out of `index.ts`
doors that is most of them.

## Decision

**Ask the kind question of the declaration, not of the door.**

`declaredKindOf` follows the re-export node's `ALIASES` edge to what the import actually names,
depth-capped at 5 — a chain of doors is normal, a cycle is not, and this must not hang on one.

**And the two barrel questions are separated**, because they are not the same question:

| caller | asks | exempts |
|---|---|---|
| `findStaleImports` | is this IMPORT dead? | `__init__.py` only |
| the orphan / unused-export branches | is this SYMBOL dead? | `__init__.py` **and** an `index` door |

ADR 0163 exempted every `index.ts` from both. That was right for the second question and wrong for
the first. For imports, TypeScript spells a republish `export { x }`, which the grammar already
captures as a use, so the exemption bought nothing and **cost five true findings** — an index door
here is routinely a real module with real code. For symbols it is still needed: measured on sofie,
narrowing it reported `BUILTIN_SYSTEMS` as an unused export while `systems/index.ts:25` was consuming
it as `export const SYSTEMS = BUILTIN_SYSTEMS` — a bare initializer read that produces no edge.

## Consequences

- Measured against the compilers:

  | oracle | at the start of todo77#P1 | now |
  |---|---|---|
  | TypeScript, vs `tsc --noUnusedLocals` | 26 missed / 0 extra | **4 missed / 0 extra** |
  | Python, vs `ast` | 4 missed / 0 extra | **1 missed / 0 extra** |

  The oracle's own line reads `27 → 4 missed`. Precision never moved off zero at any point.
- Subjects: scraper 23 → **30**, sofie 138 → **139**, orchestrator 230 → **230**. Every new finding
  hand-verified. L1 re-scored at **324 verdicts, 0 false positives**.
- Full suite green: 318 suites, **2,447 tests**. All oracles pass.
- Seven mechanisms across ADRs 0162–0164 are each mutation-proved. Two mutations that did NOT bite
  were investigated rather than accepted: one found a redundant guard (removed), the other found the
  test was guarding a different line than its comment claimed (comment corrected).

### The four that remain, and why they are not closable here

`chronicle`, `logger`, `CanonicalRank` are `const` declarations and `CanonicalKind` is reached the
same way. `PRUNABLE_BINDING_KINDS` excludes `variable` deliberately (todo63): a plain value read —
`return usedValue`, `= CONFIG`, `for (const x of TABLE)` — produces no relationship at all, so
"no evidence of use" is not evidence of no use, and claiming staleness there produced a verdict
telling the user to delete an import their code needs.

Closing these means making a bare identifier read emit an edge in every language. That is a parser
change, not a dead-code change, and this record does not make it.
