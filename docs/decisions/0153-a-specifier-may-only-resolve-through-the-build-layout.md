# 0153 — a specifier may only resolve through the build layout, and the layout is declared

Status: Accepted
- Date: 2026-08-17
- Builds: 0070, 0085, 0086, 0089
- Enforced by: tests/unit/core/parsing/build-layout.test.ts (14 cases, half of them refusals; six mutations of the resolver each turn it red), tests/unit/core/parsing/destructured-dynamic-import-is-a-use.test.ts (a destructured dynamic import that is READ rather than CALLED; three mutations each turn it red)

## Context

`electron/main/index.ts` imports `'../engine/executor/prompt-loader.js'`. `electron/engine/` does not
exist. The file is `src/engine/executor/prompt-loader.ts`, and the import is written against where
the two halves LAND rather than where they live. Nothing resolved it, so the import produced no edge
and every export of the target read as unconsumed — **six false verdicts from one unresolved
specifier**, one of them `ORPHAN`, the strongest wording `prune` has.

todo66 deferred this four times, and each deferral was right when written. Phase 0 recorded that
"nothing declares the mapping". That is true of any SINGLE config and false of the pair:

    tsconfig.json          rootDir ./src   outDir ./dist        →  src/**            lands in dist/**
    electron.vite.config   entry electron/main/index.ts
                           outDir dist/main                     →  electron/main/**  lands in dist/main/**

    dist/main/../engine/…  =  dist/engine/…  ←  src/engine/…                                        ✓

## Decision

**Only declared facts, and UNDEFINED whenever anything is missing or ambiguous.** That is the whole
shape of `build-layout.ts`, and it is why half its tests are refusals: no declaration, a `rootDir`
missing, a non-climbing specifier, an importing file outside every source directory, a landing spot
in no output directory, a target file that does not exist, a specifier that stays inside its own
output directory, or **two declarations owning one landing spot**. A wrong mapping binds a symbol to
the wrong file and makes `prune` confidently silent about real dead code (ADR 0070) — worse than the
false verdicts it removes.

**It runs LAST**, after every ordinary resolution has refused, so it can only ever turn an
UNRESOLVED into a resolution and never redirect one that already worked.

**The bundler config is read as TEXT, not evaluated.** It is TypeScript that imports plugins and
calls `defineConfig`; running it would mean executing a subject project's code inside the analyser. A
mapping written as a variable is not matched, and not matching is the correct outcome.

## Two more holes, which only became visible once the specifier resolved

Five of the six symbols cleared immediately. The sixth, `TOOL_REGISTRARS`, needed two further fixes,
and the difference between it and the other five is that **the five are CALLED and it is only READ**:

- **The un-renamed destructure registered no local binding.** `const { X } = await import(…)` emitted
  an ALIASES edge and stopped, while `const { X: y } = await import(…)` also called
  `registerLocalBinding`. So a call through the name landed and a value read did not — the
  reference-as-value edge came out as a bare name, free to be bound to any imported unit owning that
  name (ADR 0085). Same shape as the note already sitting three lines above it in that branch: the
  renamed form reached a branch the un-renamed form never did.
- **`as_expression` had a pattern for its type half and none for its value half.**
  `for (const { id } of TOOL_REGISTRARS as Array<{ id: string }>)` is a read hidden behind a cast, so
  `for_in_statement right:` never sees an identifier. `(as_expression (type_identifier)
  @pulse_type_target)` had existed for a long time; `(as_expression (identifier) @ref_value)` had not.
  It lives in the TS-only shared block because the JavaScript grammar has no `as_expression`, and
  naming a node a grammar lacks invalidates the WHOLE query (ADR 0089).

## Consequences

- **Acceptance met and measured, not asserted.** On subject-c the six named symbols go from 6 reported
  to 0, total findings 147 → 141, and **zero new findings**. On orchestrator and scraper: 241 → 241
  and 75 → 75, zero new and zero removed. The change is confined to the shape it targets.
- Three of the six resolver mutations survived the first pass, and every one was the FIXTURE being
  too weak rather than the code being right. A missing `rootDir` threw inside a `try`, so the wrong
  behaviour produced the right answer; a non-climbing specifier resolved to a file that did not exist
  anyway; and a landing spot owned by two mappings was refused by the ambiguity guard, so the
  same-mapping guard was never the rule under test.
- The first implementation collapsed every file to `outDir`, which is what a bundled entry graph
  really does. It resolved `electron/main/index.ts` and missed `electron/main/ipc/memory.ts`, which
  writes `../../`. Both specifiers are consistent with a structure-preserving emit and only one is
  consistent with a collapse — the SOURCES say which model their authors wrote against.
- `electron-vite` is the only bundler read. A project using another gets no mappings and today's
  answer, which is honest. Adding one is a new reader, not a change to this rule.
