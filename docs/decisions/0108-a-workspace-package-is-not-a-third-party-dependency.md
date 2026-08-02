# 0108 — a workspace package is not a third-party dependency
Status: Accepted
- Date: 2026-08-02
- Builds: 0014, 0099, 0107
- Enforced by: measured on `reference-project/openship` (1,897 files) — phantom `@repo/*` nodes 705 → 16, CALLS landing on them 1,771 → 9

## Context

Found by running an experiment to answer "does conducks help an agent?", not by looking for a bug.

An agent restricted to conducks was asked for the call sites of `allocateHostPort` in a pnpm
monorepo. It spent **47 tool calls, 82k tokens and 7 minutes** and returned UNDETERMINED. It was not
confused; it was fighting two defects at once.

### The graph was split in half

`@repo/adapters` is an internal workspace package — `pnpm-workspace.yaml` lists `packages/*`, and
`packages/adapters/package.json` is named `@repo/adapters`. `classifyOrigin` saw a bare scoped
specifier, found no relative path and no `node:` prefix, and called it a third-party dependency. So
every cross-package reference was given a synthetic boundary node.

Measured on openship:

| | before |
|---|---|
| phantom `external://@repo/*` nodes | **705** |
| `CALLS` edges landing on them instead of real code | **1,771** |
| incoming reference edges on the real `allocateHostPort` | **0** |

The real function showed zero callers and would read as dead to `prune`. Its two actual calls sat on
a node with `file: external://@repo/adapters/allocatehostport` and `lineStart: 0`.

This is not an edge case. Monorepos are where a cross-package graph is worth the most, and it is
precisely where the graph was disconnected.

### Nothing printed a line number

The vault has carried `nodes.lineStart` since the beginning and `edges.lineNumber` since ADR 0099 —
84,215 of openship's 113,303 edges have one. **No command printed either.** `query` returned
name/kind/file/rank; `impact` listed file names; `--mode filter` accepted `lineStart` as a filter
condition and omitted it from the returned columns.

So "find X" answered with a file and left the caller to grep for the line — which an agent
restricted to conducks cannot do.

## Decision

**1. A manifest inside the analyzed tree declares a LOCAL package.** Any `package.json` with a `name`
registers that name against its directory. No `pnpm-workspace.yaml` parsing, no `workspaces` field
handling — it works for every layout that puts a manifest beside the code, and for npm, pnpm and yarn
alike.

`ImportProcessor.resolve` checks the workspace map **before** the external-package branch, because a
workspace package is also declared as a dependency by every app that consumes it — both tests answer
yes and only one is right. It resolves to the package entry (`src/index.ts`, `index.ts`) or the named
subpath. `classifyOrigin` takes the same map, so a sibling package is no longer reported as
supply-chain surface.

**2. Line numbers are printed.** `query` gains `line`/`endLine` in JSON and `file:line` in the table.
`impact` gains `line` — the line on the edge ADJACENT to each affected node, which at distance 1 is
literally the call site — and `declaredAt` for the symbol's own position.

## Consequences

- MEASURED on openship: phantom nodes **705 → 16**, severed CALLS **1,771 → 9**. The residue is
  genuine — packages the analysis was not pointed at.
- `conducks impact <sym> --direction upstream` now answers the original question in ONE command:

  ```
  - [d:1.00] executeServerDeploy    (apps/api/.../build-pipeline.ts:1265)
  - [d:1.00] deployComposeServices  (apps/api/.../deploy.service.ts:995)
  ```

  1265 and 995 are exactly the hand-derived ground truth.
- No regression on conducks itself: 5,307 nodes, edge precision **99.98%**, 1,329 tests green.
- **The first attempt at this fix changed nothing — byte-identical numbers.** Registration ran on the
  main thread, and every file is parsed in a WORKER subprocess that builds its own `AnalyzeContext`
  from an explicitly-passed subset of state. `externalPackages` was on that list and the new map was
  not, so the fix was live exactly where no parsing happens. Re-running and seeing 705 unchanged is
  what caught it; reasoning would not have.
- Calls now land on the BARREL node (`index.ts::allocateHostPort`, the re-export) rather than on the
  ultimate declaration in `host-port.ts:48`. That is defensible — the import genuinely is from the
  barrel — and the question is answerable either way. Collapsing a re-export chain onto its origin is
  left open, and stated rather than implied.
- **This was found by an experiment, not by an audit.** Ten commands had been measured against
  written-first expectations and all ten were fixed; none of that exercised a monorepo, because both
  measured subjects are single-package. The capability that most distinguishes this tool was the one
  never tested.
