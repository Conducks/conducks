# 0152 — query patterns are files, not template literals

Status: Accepted
- Date: 2026-08-17
- Builds: 0089
- Amends: 0089
- Enforced by: tests/unit/core/parsing/query-files-are-scm.test.ts (all 13 packs load from `.scm`, a backtick survives into a real C parse, an unknown `@include` throws — mutation-verified, four mutations of the loader each turn it red), tests/unit/core/parsing/position-parity.test.ts (the shared block is composed, never re-inlined)

## Context

Every language's tree-sitter patterns lived in a TypeScript template literal. A backtick inside one
TERMINATES THE STRING, and a backtick is ordinary prose in a `;;` comment — it is how a grammar node
gets named. `tsc` then reported `TS1005: ',' expected` pointing at query text that names nothing.

It fired **10 times in 10 days**. ADR 0089 added a pre-build gate that names the file and line, and
the gate caught 10 of 10. That is a mitigation working, not a design working.

todo31 deferred the migration four times on ONE stated risk: runtime path resolution across `build/`,
jest and spawned workers — a class of bug this repository has paid for more than once. The deferral
was correct each time it was written, because nobody had measured that risk.

**It was measured before this was done, and it does not materialise.** `import.meta.url` was already
in use across `src` — including inside `grammar-registry.ts`, the parsing feature itself. Probed on
the smallest pack first, in all three places a pack is loaded:

| context | anchor resolves to | verified by |
| --- | --- | --- |
| jest | the SOURCE module, so `src/…` | the pack suite, green |
| built CLI | the compiled module, so `build/src/…` | `oracle-packs`, C still MISSED 0 |
| pulse worker | a separate PROCESS with its own cwd — still correct | `analyze` on a C project with `CONDUCKS_WORKERS=2`, symbols landed |

## Decision

**Each pack reads `queries.scm` beside it**, through one loader (`languages/scm.ts`) resolved against
the caller's `import.meta.url` — never `process.cwd()`, which is what would have made the worker case
fail. `scripts/copy-scm.mjs` puts the file beside the compiled module and **fails a build that copied
none**, because packs that all throw on first parse behind a successful build is the ADR 0044 shape.

**A shared block is spliced in PLACE by `;; @include NAME`**, not appended. Position is not cosmetic:
javascript carries `assignment_pattern` AFTER its shared blocks, and two patterns matching one node
race to create it (ADR 0086). An unknown name **throws** — leaving the marker would be a `;;` comment,
so the query would still compile while silently losing every shared pattern in that pack. That is
exactly how javascript lost `for_in_statement` for months.

**`scripts/check-query-backticks.mjs` and its guard test are deleted**, which is todo31's stated
acceptance. The replacement test asserts the inverse and proves it end to end: a backtick reaches a
real compiled query, not merely a file on disk.

## Consequences

- **Every compiled pattern is byte-identical.** Dumped all 13 packs' `queryScm` before and after and
  diffed: 850 significant lines each side, no difference. The only changes are blank lines and
  backslashes inside `;;` comments — and those are a CORRECTION, because the template literal was
  silently eating them. `use A\B as C` had been reaching the runtime as `use AB as C`, and
  `(\$client|…)` as `($client|…)`. Comments describing PHP namespace and variable syntax were wrong
  for as long as they had lived in a template literal.
- Two existing tests read the query SOURCE and had to follow the patterns to `.scm`.
  `taxonomy-reachability.test.ts` is the one worth naming: pointed at the five-line loader it would
  have split in half — the `toBeGreaterThan(0)` cases failing loudly, and every `isPackage: false`
  assertion passing on empty text. A negative assertion over a source that turned out to be empty is
  a check that ran on nothing.
- The C pack was migrated first as the probe and kept its own inline `readFileSync`. That went
  unnoticed until a loader mutation failed to kill anything — the test was asserting against the one
  pack the loader did not serve. One loader now, no copies.
