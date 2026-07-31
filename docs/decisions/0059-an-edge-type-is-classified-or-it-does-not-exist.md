# 0059 — an edge type is classified, or it does not exist
Status: Accepted
- Enforced by: tests/unit/core/graph/edge-coupling.test.ts (a dataflow ring is not an import cycle, a genuine import ring still is, and the three sets account for the whole union)
- Builds: 0017, 0053
- Date: 2026-07-31

## Context

`conducks audit` on this repository reported, as a red architectural alert:

```
🔄 [Architectural Alert] 1 Circular Dependencies Detected:
  - ARCH-3: Circular: path.dirname -> path.join -> path.resolve
```

Those are three functions in node's own `path` module and none of them calls another. The tool was
reporting a circular dependency inside the standard library.

The edges behind it are `PULSES_TO` — value handovers, produced by nested `path` calls in this
project's own source. ARCH-3 means a MODULE IMPORT cycle (ADR 0017), and a handover is not an
import. It walked them because `IMPORT_CYCLE_IGNORED_EDGE_TYPES` was an array literal:

```ts
export const IMPORT_CYCLE_IGNORED_EDGE_TYPES: EdgeType[] = [
  ...NON_RUNTIME_EDGE_TYPES, 'CALLS', 'CONSTRUCTS', 'ACCESSES'
];
```

`PULSES_TO` joined `EdgeType` and never joined this list. An array cannot be exhaustive, so nothing
asked. **The file's own header warns about this exact failure** — it records that `PULSES_TO` was
once written as `'PULSES_TO' as any` and that a cast is how an edge type stays invisible. The
warning was written, and the list three lines below it was still an array.

Pulling that thread found the same defect twice more, and a third one underneath both.

| what | where | state |
|---|---|---|
| `PULSES_TO` never classified | `adjacency-list.ts` | walked by ARCH-3 |
| `'DEFINES' as any` | `flow.ts:60` | **4 rows in the vault** under a type `EdgeType` did not contain |
| `ALIASES` | `binding.ts:17`, reachable from `reflector.ts:534` | in the parser's union, absent from `EdgeType` |
| `type: rel.type as any` | `graph-engine.ts` | the hole all three came through |

The last row is the cause of the other three. `GraphEngine` is where a parsed relationship becomes a
graph edge, and it cast the parser's type straight into `ConducksEdge`. Any type a processor invented
became an edge type in the vault, classified by nothing.

## Decision

**Every edge type is classified at exactly one coupling level, in one exhaustive `Record`, and the
derived sets follow from it.** The levels nest — `containment ⊂ erased ⊂ local ⊂ module` — so one
decision per type produces all three sets:

| level | meaning | members |
|---|---|---|
| `containment` | "X is defined inside Y", not "X depends on Y" | `MEMBER_OF` `CONTAINS` `HAS_METHOD` `HAS_PROPERTY` |
| `erased` | in the source, absent at runtime | `TYPE_REFERENCE` `GOVERNS` `DEFINES` |
| `local` | real coupling, below module level | `CALLS` `CONSTRUCTS` `ACCESSES` `PULSES_TO` `ALIASES` |
| `module` | a module dependency — ARCH-3 walks exactly these | `IMPORTS` `EXTENDS` `IMPLEMENTS` `DEPENDS_ON` `FROM_IMAGE` `VIRTUAL_LINK` |

`STRUCTURAL_EDGE_TYPES`, `NON_RUNTIME_EDGE_TYPES` and `IMPORT_CYCLE_IGNORED_EDGE_TYPES` are now
derived. No consumer changed. This is the remedy ADR 0053 applied to `RESOLVABLE`, applied to the
other classification in the same file — and it worked immediately: adding two members to `EdgeType`
broke the build in `linker-intra.ts` until both were classified there too. That is the mechanism
doing its job before a human noticed the gap.

**`DEFINES` and `ALIASES` join `EdgeType`.** Both are real and both were already being emitted. The
honest move is to name them and classify them, not to keep them casting past the type system.
`DEFINES` is `erased` because the route node it points at is virtual — its `filePath` is the literal
string `'network'` — so it is not code and must not compete with code for gravity, on ADR 0058's
reasoning for `GOVERNS`.

**The parser boundary is closed by the compiler, not by a comment.** `graph-engine.ts` drops its
cast and carries a type-level assertion that the parser's relationship union is a subset of
`EdgeType`. A processor inventing a type is now a compile error at the point of conversion.

**`audit` reports both halves and computes the exit code last.** The verdict chain was
`if/else-if`, so a run where the rule set passed and the core checks did not fell to a third branch
that exited 1 having printed no verdict — findings on screen, nothing saying whether they were
fatal, and the passing rule set never mentioned. Both halves now always print.

**`guard` stops calling an unassessed run safe.** Found while gating this change. `guard.ts:79`
printed `🛡️ Structural resonance is within safe limits.` unconditionally, so a run with no baseline
said `NOT ASSESSED … this is not a pass` and then declared safety two lines later. The comment
directly above it already forbids exactly this — it records that prefixing a green tick to
`NOT ASSESSED` reproduces ADR 0044's failure one layer up — and the next statement did it with a
different string. Same shape as the array literal below its own warning: the rule was written down
and the line beneath it was not checked against it.

**Not chosen: excluding `PULSES_TO` from cycle detection at the call site.** Every caller of
`detectCycles` passes the same ignore list; fixing one caller would leave the others wrong and the
next caller would copy whichever it found first. The classification belongs with the type.

**Not chosen: a runtime validator at the parser boundary.** It would catch a bad type after the
parse, in a warning nobody reads. The subset relation is checkable at compile time, so it is checked
there, and the runtime stays free of a guard for a state the compiler already refuses.

## Consequences

Measured on this repository:

| | before | after |
|---|---|---|
| ARCH-3 circular dependencies reported | 1 (false) | 0 |
| `audit` exit code | 1 | 0 |
| `audit` verdict lines printed when core checks fail | 0 | 2 |
| `guard` safety claims made without a comparison | 1 | 0 |
| edge types reaching the vault unclassified | 2 (`DEFINES`, `ALIASES`) | 0 |

The single reported cycle was the only one, so ARCH-3 on this project went from one false positive to
silence. That is the correct answer and it is worth stating plainly: this repository has no import
cycles, and the tool has been claiming otherwise.

Anyone who read an ARCH-3 finding involving a library symbol before this date was reading a dataflow
handover mislabelled as an import cycle. The mislabelling scales with how much a project nests calls
to the same module, so a heavier user of `path` or `fs` would have seen more of them.

`Open:` **100 of 164 `PULSES_TO` edges have an external library symbol at BOTH ends** — the
`path.resolve -> path.dirname` shape. `bindPulseCircuits` attributes a handover to the two CALLEE
names rather than to the scope the handover happens in, so every `path.dirname(path.resolve(x))` in
the project collapses into one global edge asserting that `path.resolve` feeds `path.dirname`. The
endpoints are not lost — all 100 already have local `CALLS` edges to both ends, verified by query —
but the "A feeds B" relation is attributed outside the system being analysed. Deleting them was
considered and refused: the harm they were doing is fixed by the classification above, and the real
question is whether the handover should be scoped to the local caller instead, which is a redesign of
`bindPulseCircuits` rather than a filter. Carried by todo25#P13.

`Open:` `ALIASES` produces 0 rows on this project, so its classification above is reasoned rather
than measured. `processAlias` is reachable from `reflector.ts:534` and the Go and Ruby wildcard paths
are the likely producers, so the first polyglot vault with alias captures is the measurement that
confirms or corrects it. Carried by todo25#P13.
