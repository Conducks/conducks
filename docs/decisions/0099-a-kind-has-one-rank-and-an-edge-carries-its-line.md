# 0099 — a kind has one rank, and an edge carries its line
Status: Accepted
- Date: 2026-08-02
- Builds: 0012, 0013, 0004, 0067, 0090
- Enforced by: tests/unit/core/taxonomy-rank-single-source.test.ts (no source file writes a rank as a literal; `mapToCanonical` agrees with the table for every kind; the ladder is dense and strictly ordered), tests/unit/core/edge-line-number.test.ts (a call inside a loop, a construction, a heritage clause, and no call edge left without a line)
- Promoted: docs/memory.md; docs/modules/core/parsing/taxonomy/MODULE.md

## Context

Two defects found while asking a design question — whether the taxonomy should keep thirteen rungs or
cut to function level. Neither had ever failed anything.

**A kind had more than one rank.** `CanonicalRank` is the table, and six producers wrote the number by
hand instead of reading it. The numbers they wrote came from an earlier nine-rung ladder the taxonomy
outgrew. Measured on this repository's own vault before the change:

| node | rank in the vault | rank the table states | writer |
|---|---|---|---|
| file ×215 | 3 | 5 | `graph-skeleton-builder.ts` |
| file ×410 | 5 | 5 | reflector — the correct path |
| directory ×134 | 2 | 4 | `graph-skeleton-builder.ts` |
| library namespace ×21 | 1 | 7 | `domain/analysis/index.ts` |
| library symbol ×169 | 7 | 8 | `domain/analysis/index.ts` |
| route / request ×6 | 6 | 8 | `processors/flow.ts` |
| any unranked node | 2 — DIRECTORY's rung | UNIT's rung | `graph-engine.ts`, whose kind fallback said UNIT |

So 215 of 625 files sat two rungs above the other 410, with the same `canonicalKind` and the same
`semantic_kind`. Rank drives hierarchy, layer paths and `context`'s rank exclusion (ADR 0067), and
every one of those saw two classes of the same thing. The **taxonomy legend** — the nodes the graph
emits to describe its own ladder — was itself a hand-written nine-entry list, so the graph shipped a
self-description that contradicted the graph.

A rank is a plain integer. A wrong one type-checks, persists, and reads back exactly like a right one.
The suite was green, `audit` was green, and a characterization test was actively pinning DIRECTORY at
2 — faithfully locking in the defect it was written to protect.

**An edge did not record where it happened.** The `edges` table has carried a `lineNumber` column
since it was created and `saveEdges` has always read `properties.line` to fill it. Nothing ever wrote
that key: **18,541 edges, every one of them null.**

That gap is what made "should we emit STATEMENT and BRANCH nodes?" look like a real question. A class
constructed inside a loop in function `A` produces one edge, `A → UserService`, and the loop is not a
node — so *where inside `A`* was unanswerable, and the standing proposal for answering it was a node
per statement. On this repository's 32,069 lines that is roughly 32,000 nodes against the current
5,220, to answer a question whose answer is one integer.

## Decision

**Rank is read from `CanonicalRank`, never written.** Every producer now reads the table, the legend
is derived from the enum, and `graph-engine`'s two fallbacks agree — the rank follows whichever kind
actually won rather than being a second independent guess. One exemption, commented at its site: the
legend's own anchor is `-1`, because a node that describes the ladder cannot stand on a rung of it.

**An edge records the source line of the reference, and that is why the graph stays at the BEHAVIOR
floor.** A position is a number, not an entity. `line` is threaded from the tree-sitter match row
(0-based, so `+1`) through the call, heritage, flow and import paths into `properties.line`.

**STATEMENT and BRANCH stay unemitted, deliberately, and this is now the stated reason** rather than
an unfilled gap in ADR 0004. Sub-line positions are answered by the line on the edge.

Rejected: (a) emit a node per statement/branch — 6× the graph to answer a question a column answers,
and it would re-flood what ADR 0013 drained; (b) fix the wrong ranks in place and keep the literals —
the defect is not a wrong value, it is a value written in a second place, which is free to drift the
next time a kind is added. The guard is therefore a grep over `src/`, not an assertion about numbers.

## Consequences

- MEASURED on this repository, full rebuild: **one rank per kind**, no exceptions beyond the
  documented `-1` anchor. 5,220 nodes, 18,637 edges.
- Line coverage by edge type, from 0% across the board:

  | type | edges | with a line | |
  |---|---|---|---|
  | CALLS | 5,628 | 5,628 | 100% |
  | ACCESSES | 2,518 | 2,518 | 100% |
  | IMPORTS | 2,002 | 2,002 | 100% |
  | CONSTRUCTS | 1,273 | 1,273 | 100% |
  | TYPE_REFERENCE | 1,099 | 1,099 | 100% |
  | DEPENDS_ON | 652 | 652 | 100% |
  | IMPLEMENTS / EXTENDS / DEFINES | 78 | 78 | 100% |
  | MEMBER_OF | 5,002 | 0 | containment — no call site exists |
  | PULSES_TO | 267 | 0 | synthesized by the cross-service binder |
  | GOVERNS | 118 | 0 | a document pinning a file, not a reference |

  **13,250 of 18,637 (71.1%)**, and every reference edge type is complete. The three at zero are
  edges with no position to record, stated rather than counted as a shortfall.
- Precision is unchanged at **99.98%** against source (`tools/verify-edges.mjs`), so the added field
  cost nothing in correctness.
- A new instrument, `tools/verify-edge-lines.mjs`, checks that a recorded line is the line the
  reference is WRITTEN on — presence and correctness are different properties, and a line that is
  present but wrong reads exactly like a right one. **6,275 decidable positions, 0 wrong, 1,799
  unchecked** (delegation and renamed imports, which cannot be located from the target id).
- That checker's first two findings were both its own. `shouldBlock` appeared in a comment on another
  line and `main` in an `import { main as startMcpServer }`, so "the name is elsewhere in the file,
  therefore the recorded line is wrong" concluded a defect from prose. Both recorded lines were
  correct. The instrument is wrong before the graph is — the seventh time this project has paid for
  trusting a fresh tool's first output.
- Every node's and every edge's content hash changed, since `canonicalRank` and `lineNumber` are both
  hashed (`content-key.ts`). One-time full re-analyze, the same absorption ADR 0084 and ADR 0086 each
  took once.
- `reflection-pipeline.ts` rebuilds an import edge's `properties` by hand rather than spreading the
  relationship's metadata, so `line` had to be carried explicitly at four sites. Anything the
  reflector adds to an IMPORTS relationship is dropped at the edge unless it is named there. Noted as
  a shape worth collapsing, not changed here.
- The characterization test that pinned DIRECTORY at 2 now asserts through the table. A
  characterization test records what the code DOES, which is exactly why one can outlive the moment
  its subject stopped being right.
