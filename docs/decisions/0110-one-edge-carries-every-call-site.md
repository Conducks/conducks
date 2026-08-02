# 0110 — one edge carries every call site
Status: Accepted
- Date: 2026-08-02
- Builds: 0099, 0108, 0109
- Enforced by: measured on `reference-project/openship` — `impact` on `assembleGitClone` returns all 16 hand-derived call sites with exact lines in one call

## Context

The last gap from the agent experiment. After ADR 0109 connected barrel re-exports, one `impact`
call found every caller FILE — and understated every file that calls the target more than once.

`git-clone.test.ts` invokes `assembleGitClone` eleven times. The graph knew line 59 and nothing else.
`server-git-ambient.ts` calls it on two adjacent lines; the graph knew 108 and not 109.

The cause is one line in `ingestSpectrum`:

```ts
id: `SEMANTIC::${sourceId}->${targetId}::${rel.type.toLowerCase()}`
```

The id carries no line, and `addEdge` returns early on a duplicate id — so the second through
eleventh call sites were silently discarded. The reflector emitted all eleven relationships
correctly; the graph collapsed them.

So "every call site of X" was unanswerable however the question was phrased, on a graph that had
parsed every one of them.

## Decision

**One edge per relationship, carrying `lines: number[]` — every site.**

The line is deliberately NOT added to the edge id. Three reasons, and the first is the one that
matters: something already parses that id format (`graph-engine.ts` reads the scope out of a CALLS
edge's id), edge ids are content-hashed for freshness, and multiplying edges would change every
figure that uses edge count as a denominator — including the dangling rate this project spent a day
learning to measure honestly (ADR 0096).

Collecting the lines on the single edge keeps the graph's shape and answers the question.

`line` is retained as the first site so every existing reader is unchanged; `lines` is the complete
set. `impact` returns both, and the CLI prints `:59 (+10 more)`.

Rejected: (a) one edge per call site — the id-format and denominator problems above, for a fact that
fits in an array; (b) a separate call-sites table — a second store for data the edge already owns.

## Consequences

- MEASURED on openship, one `impact` call on the declaration:

  ```
  git-clone.test.ts       [59, 76, 82, 100, 138, 142, 148, 155, 156, 162, 173]
  server-git-ambient.ts   [108, 109]
  docker.ts               [877]
  docker-build-context.ts [228]
  build-pipeline.ts       [249]
  ```

  **16 call sites — exactly the hand-derived ground truth**, where the previous run found 6.
- No regression on conducks itself: 5,324 nodes, 19,053 edges, dangling **6.02%**, edge precision
  **99.98%**, line accuracy **100%**, 1,329 tests green. Edge count moved by 4, which is the point —
  the fix adds data to existing edges rather than new edges.
- The three oracle tasks are now all answerable from the graph alone:

  | | before the experiment | now |
  |---|---|---|
  | T1 `allocateHostPort` | UNDETERMINED, 47 tool calls | correct, **1 call** |
  | T2 `assertCapability` | verdict only, no lines | correct, 2 calls |
  | T3 `assembleGitClone` | 6 of 16 sites, 3 manual queries | **16 of 16, 1 call** |

- **Every defect in this chain was found by using the tool, not by auditing it.** Ten commands had
  been measured against written-first expectations and all ten fixed; none of that surfaced the
  workspace misclassification (0108), the MCP anchor lock or the dropped line columns (0109), or
  this. An agent trying to do a real task on an unfamiliar monorepo surfaced all four in one
  afternoon.
