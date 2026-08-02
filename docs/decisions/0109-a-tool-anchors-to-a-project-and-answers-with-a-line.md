# 0109 — a tool anchors to a project, and answers with a line
Status: Accepted
- Date: 2026-08-02
- Amends: 0067
- Builds: 0099, 0108
- Enforced by: tests/unit/domain/analysis/reexport-resolution.test.ts (a plain re-export emits an ALIASES edge, reversing the assertion that it must not) — plus measurement on `reference-project/openship`

## Context

Found by using the MCP surface by hand, after ADR 0108 fixed the graph beneath it. Three defects,
none in the graph and all in the layer between the graph and the caller.

**The MCP server could not be pointed at a project.** Its root is wherever the client launched it —
here a directory holding several repos and no vault of its own. With `path` set to a real analyzed
project: `Path traversal rejected`. Without `path`: DuckDB's raw `Cannot open database ... does not
exist`. So the whole surface was unusable for any project but one, while `ensureAnchor`'s own
docstring says it exists "to prevent Detached Root errors when the MCP server is launched from an
arbitrary directory". The guard defeated the thing it was named for.

**No MCP tool returned a line.** ADR 0108 had put lines on the CLI and in the domain layer; the MCP
surface dropped them in two separate mappings. `conducks_query`'s `location` carried
file/namespace/parent, and the `find_by_name` template did not even `SELECT lineStart` — so the data
never left SQL. `conducks_impact` reshaped its nodes into id/name/file/summary and discarded the line
the domain layer now provided.

**A barrel re-export was an island.** `export { assembleGitClone } from './git-clone'` minted a node
whose only edge was `MEMBER_OF` to its own file. Every consumer importing through the barrel was
invisible from the declaration, so answering "who uses this" meant querying each node of the
re-export chain by hand — three separate `impact` calls on openship to find four caller files.

## Decision

**1. A tool may anchor to any real project.** The guard's rule was "inside `process.cwd()` or
reject". The constraint that keeps the security property while restoring the capability is not
"inside the launch directory" but **"is itself a conducks project"** — a directory holding
`.conducks/` or `conducks.json`. That cannot be used to read `/etc`, and it is exactly the set of
places a structural tool has business answering about. Paths inside the launch root are accepted
unchanged, so the change is purely additive.

**2. A workspace root says so.** When the anchored root has no graph but holds projects that do, the
error names them and how to pick one, instead of surfacing a DuckDB IO error that reads like the tool
is broken. Diagnostic only — it never changes which root is used.

**3. Line numbers reach the MCP surface.** `find_by_name` selects `lineStart`/`lineEnd`,
`conducks_query`'s `location` carries them, and `conducks_impact` keeps the domain layer's `line`.

**4. A plain re-export emits an ALIASES edge, and `impact` traverses it.** The renamed form already
did; the un-renamed form (`export_specifier name: @name !alias`) has no `@alias` capture and never
reached that branch — the gap was in the query shape, not the idea. `ALIASES` is weighted 0.5 in the
traversal: a re-export is a pass-through, not a hop worth penalising, so a consumer reached through a
barrel ranks alongside one reached directly.

## Consequences

- MEASURED on openship: one `impact` call on the declaration now returns all four caller files with
  correct lines — `docker.ts:877`, `server-git-ambient.ts:108`, `docker-build-context.ts:228`,
  `build-pipeline.ts:249`. It took three calls before.
- `conducks_impact` on `allocateHostPort` answers in ONE call with `build-pipeline.ts:1265` and
  `deploy.service.ts:995`, exactly the hand-derived ground truth.
- **This reverses an existing test.** `reexport-resolution.test.ts` asserted that a plain re-export
  must NOT get an ALIASES edge — "does not fabricate" — reasoning that same-name-at-both-ends lets
  IntraLinker match it unaided. On a real monorepo it cannot. The test was not deleted: it was
  re-measured, reversed, and now carries the evidence. `export { x } from './y'` states that this
  barrel's `x` IS `y`'s `x`, which is what the edge records — a fact, not a fabrication.
- No regression: 1,329 tests green, conducks self-analysis 99.98% edge precision.
- ADR 0067's ranks are amended by this record only in that the scoring surface now carries positions
  it did not before; the weighting itself is unchanged.
- **Same shape as ADR 0105, twice more.** The graph had the answer and a presentation layer dropped
  it — `explain` printed NaN over correct numbers, `--blueprint` printed `[object Object]` over real
  violations, and these two dropped a column. Worth watching for as a class rather than fixing one at
  a time.
