# 0107 — an incremental pulse resolves against the whole project
Status: Accepted
- Date: 2026-08-02
- Builds: 0101, 0106
- Enforced by: tests/integration/features/analyze-twice.test.ts ("a file added incrementally gets its import edges, not just its calls" — asserted through `rename`, the strictest reader of import edges), tests/integration/features/rename-safety.test.ts (the aliased-import case, which is what surfaced it)

## Context

Found while closing the one thing ADR 0106 left unclaimed: whether `rename` handles
`import { validate as check }`. Run by hand, it did — the original changed at the import line and
the local alias did not. Written as an integration test against the same harness every other rename
case uses, it **failed**: the import was not rewritten at all.

The same shape had appeared once before during ADR 0106's work and I attributed it to my own test
sequence. That was half right — the trigger was an incremental analyze mid-scenario — and half
wrong, because the incremental analyze was the defect, not the test.

**Import specifiers are resolved against the list of files the pulse knows about, and that list was
built from the DIRTY set.** On a cold run every file is dirty, so it is complete and everything
resolves. On an incremental run the file being imported FROM is not in it, so `'./email.js'`
resolved to nothing and the per-binding `IMPORTS` edge was never created.

Reproduced minimally: analyze a project with one file, add a second that imports it, analyze again.

| edge | cold | incremental (before) |
|---|---|---|
| `CALLS caller.ts::useIt → email.ts::validate` @3 | present | present |
| `IMPORTS caller.ts::unit → email.ts::validate` @1 | present | **missing** |

It hid well. The `CALLS` edge still appears, because `IntraLinker` runs afterwards against the
persisted graph and resolves by name — so the graph looked linked while its import edges were
quietly absent, and only a consumer that reads `IMPORTS` specifically would notice.

Two do:

- **`rename`** locates its edit sites from those edges (ADR 0106), so it rewrote a call and left the
  import behind — **a file that no longer compiles**, produced by the one tool that writes to source.
- **`prune`** reads them for the reachability test that separates a verdict from a question
  (ADR 0104), so a file imported only by a recently-changed file would read as unimported.

## Decision

**The resolution universe is every file discovery returned, not every file being parsed.**

`AnalyzeOrchestrator.analyze` takes `allDiscoveredPaths` and resolves imports against it, falling
back to the parsed set when the caller does not supply one. `AnalysisService` passes `filteredFiles`
— the full discovery — while continuing to parse `dirtyFiles`.

Parsing and resolving are different questions, and conflating them is what made a pulse's output
depend on which files happened to be dirty.

Rejected: (a) re-parse every file on every pulse — that is what incremental analysis exists to
avoid; (b) let `IntraLinker` synthesise the missing import edges afterwards — it resolves by NAME,
which is the coincidence-binding ADR 0070 refuses, and it would be reconstructing information the
specifier already states exactly.

## Consequences

- Measured on the minimal fixture: the `IMPORTS` edge now appears on an incremental pulse, matching
  the cold result. The test asserts it **through `rename`**, because a graph query can be satisfied
  by the `CALLS` edge alone — the import edge only proves itself when something must act on it.
- The test was **run against the unfixed build and failed**; the other three cases in that file pass
  either way.
- No change on a cold run, confirmed on this repository: **99.98% edge precision, 100% line
  accuracy**, unchanged.
- **ADR 0106's unclaimed case is now claimed.** `import { validate as check }` renames the original
  and leaves the local alias alone — correct by construction rather than by a special case, which is
  exactly why it is now pinned: nothing in the engine mentions aliases, so nothing protects it if the
  matching strategy changes.
- This is the second defect in three days whose whole cause was **a cold vault being the only state
  ever measured** (ADR 0101 was the first). Both were invisible to a suite where every test analyzes
  once. The rule earned twice over: *run it twice, with an edit in between.*
