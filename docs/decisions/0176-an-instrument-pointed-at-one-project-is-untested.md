# 0176 — an instrument pointed at one project is untested
Status: Accepted
- Date: 2026-08-27
- Builds: 0173, 0175
- Enforced by: tools/benchmark/oracle-tsc.mjs

## Context

Asked which projects `prune` had actually been measured on, the answer turned out to be uneven in a
way nobody had written down. **`oracle-tsc.mjs` — the strongest instrument, prune scored against
`tsc --noUnusedLocals` — had only ever run against conducks itself.** Both TypeScript subjects had
been checked by hand and by the export oracle, and never by the compiler on their imports.

Pointing it at them found three defects in the instrument, in the order they surfaced.

- **`npx tsc` is not the compiler.** It resolves whatever the project has, and in the sofie subject
  that is a package which prints *"This is not the tsc command you are looking for"* and exits 0. The
  oracle would have scored prune against silence. ADR 0173's liveness probe is the only reason this
  was a caught bug rather than a green tick.
- **`EXTRA` blamed prune for files the compiler never opened.** sofie's tsconfig is
  `include: ["src/**/*"]`; both prune findings were in `renderer/` and `scripts/`, so tsc emitted no
  diagnostic about either, and the oracle called two hand-verified TRUE findings precision bugs.
- **The liveness probe was conducks-specific.** It imported `./contracts/index.js`, a path that
  exists here and nowhere else, and it wrote into `src/`, which is not a compiled directory in every
  project. On the orchestrator subject it reported a working instrument broken.

## Decision

The oracle resolves the real compiler, scores only what the compiler compiled, and plants a probe
that depends on nothing but itself.

- `resolveTsc` prefers the project's own `node_modules/typescript/bin/tsc` — a subject is judged by
  the compiler it builds with — and falls back to this repository's devDependency.
- `compiledFiles()` reads `--listFiles`, and `EXTRA` is scored only over that set. A file outside the
  program produces no diagnostic either way, and counting that as a contradiction blames the tool for
  the oracle's blind spot.
- The probe writes a target AND its importer, beside a file the compiler demonstrably compiled.

## Consequences

- Every instrument now names its target, and the coverage is written down rather than assumed:

  | target | imports vs tsc | exports vs tsc | python | python dead | trace |
  |---|---|---|---|---|---|
  | conducks | ✓ 0/0 | ✓ | — | — | — |
  | sofie | ✓ **0/0, new** | ✓ | — | ✓ 0/0 | — |
  | orchestrator/admin | ✓ **0/0, new** | — | — | — | — |
  | orchestrator/app | **cannot** — see below | ✓ | — | — | — |
  | scraper | — | — | ✓ 0/0 | ✓ 0/0 | ✓ |

- **`orchestrator/app` cannot be scored, and that is recorded rather than worked around.** Its
  tsconfig declares `types: ["node", "react", "react-dom", "next"]` and those `@types` packages are
  not installed, so tsc reports `TS2688` and stops emitting the unused-import diagnostics this
  oracle reads. The probe correctly reports the instrument as broken there. It needs
  `npm install` in the subject, which is the subject's business, not conducks'.
- The monorepo has **no root tsconfig**: each workspace carries its own, so the oracle runs per
  workspace. That is why the historical baseline key is `app::exports` and not `orchestrator`.
- All eight instrument runs pass, the prune benchmark is 10/10, 319 suites / 2,469 tests, all three
  subjects clean.

**The general point, and the reason this is a record.** An instrument that has only ever met one
subject is not a verified instrument — it is a instrument that happens to work on one input. Three
defects were sitting in this one, and all three needed a second project to become visible. The same
sentence applies to the tool it measures, which is why ADR 0167 made a subject refresh part of the
method.
