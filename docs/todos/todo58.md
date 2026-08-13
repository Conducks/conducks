# todo58 — the linker does not resolve `await import()`, so live code is reported dead
Status: todo
- Acceptance: a symbol destructured from a dynamic `await import(...)` and used is NOT reported by `prune`, and DOES appear in `impact --direction upstream` for its callee — measured on sofie, where 9 of 172 findings and 1 of 3 known callers are currently wrong.
- Builds: 0026

## Context

First measurement of whether conducks' findings are TRUE, rather than well-formed. Done against a
frozen benchmark subject (sofie) rather than conducks itself, on 2026-08-09, by taking findings and
verifying each by hand with memory.md's method — the claim the finding makes, not "does the name
appear".

**Ten ORPHAN findings, checked one by one: nine correct, one wrong.** Two of the nine looked wrong at
first and were not, which is the trap memory.md already records:

| symbol | first impression | truth |
|---|---|---|
| `Console` | used in two files | the only hit is the word inside `<h3>Sandbox Console</h3>` — PROSE |
| `MemoryEdge` | imported by three files | they import a DIFFERENT `MemoryEdge` from `../types.js` |
| `readAgentRoutingPrompt` | used once | genuinely used — conducks is WRONG |

The one real miss is a dynamic import:

```ts
// electron/main/index.ts:1315
const { loadAgentSystemPrompt, loadKernelPrompt, readGlobalPrompt, readAgentRoutingPrompt,
        agentPromptPath } = await import('../engine/executor/prompt-loader.js');
return readAgentRoutingPrompt(agentName);            // :1319
```

**Blast radius, measured.** sofie holds 25 such destructuring sites reaching 28 distinct symbols. Nine
of them are in conducks' 172 findings:

| symbol | flagged as |
|---|---|
| `readAgentRoutingPrompt` | ORPHAN |
| `TOOL_REGISTRARS`, `agentRoutingPath`, `computeEffectiveSignificance`, `globalPromptPath`, `kernelPromptPath` | UNUSED_EXPORT |
| `registerBackgroundSessions` | STALE_IMPORT |
| `LinuxAdapter`, `MacOSAdapter` | UNIMPORTED_MODULE |

Two spot-checked to rule out name coincidence: `TOOL_REGISTRARS` is destructured from
`await import('../plugins/tools/index.js')`; `MacOSAdapter` from `await import('./macos.js')` and then
`new MacOSAdapter()`.

So **precision is ~94.8% (163/172)**, and the errors are one mechanism, not scattered noise. The two
`UNIMPORTED_MODULE` cases are the least harmful — that type is a QUESTION by design (ADR 0026), and
"nothing STATICALLY imports this file" is literally true. The other seven are verdicts and are wrong.

**`impact` has the same hole.** `loadKernelPrompt` has three real callers; conducks returns two and
misses `electron/main/index.ts:1341`, again behind `await import()`. Recall matters more here than in
`prune`: a missing caller means "what breaks if I change this" answers with a caller that does break.

## Phase 1 — resolve the dynamic form

- [x] The SCM query for `const { a } = await import('./x.js')` ALREADY existed and worked — it mints a
      module-level binding and an ALIASES edge. The break was one layer down: a dynamic import is
      normally written INSIDE a function, so the destructured name is also a function-scoped local, and
      the CALL resolves to that local while the ALIASES edge hangs off a module-level node nothing
      points at. Two nodes for one fact, never meeting. Worse, that module-level node is never
      materialised at all — the ALIASES edge sits with a DANGLING SOURCE, which is why a first fix that
      looked the source up with `getNode` never fired on the case it was written for. IntraLinker now
      derives the binding from the edge's own id (`<file>::<name>`) and rebinds a same-file, same-name
      local to the aliased definition. Pinned by
      `tests/unit/core/graph/dynamic-import-scoped-alias.test.ts`, including two controls that must NOT
      rebind (no same-named binding; a same-named local in another file).
- [x] A computed specifier (`await import(someVar)`) is still not resolved and still must not be
      guessed at. None of sofie's 25 sites uses one — every specifier is a literal.
- [x] RE-MEASURED, and the answer corrects this todo's own diagnosis. Two of the nine dropped out
      (`LinuxAdapter`, `MacOSAdapter`); seven did not, and they are NOT a dynamic-import problem at all:
      every one is imported by `electron/main/index.ts` with a specifier written against the BUILT
      layout. `../engine/executor/prompt-loader.js` from `electron/main/` resolves to
      `electron/engine/...`, which does not exist — the real file is `src/engine/...`, and the path only
      works after `tsc` emits both under `dist/` as siblings (`rootDir: ./src`, `outDir: ./dist`).
      No source-level resolver can follow that without modelling the build. Precision on sofie is now
      171 findings with 7 known-wrong from this separate cause.
- [x] The DECISION is already made by precedent, and this task overstated how open it was. ADR 0070 settled the identical question for aliases: when resolution finds nothing, "return undefined immediately — do not fall through", because the fallback fabricated a target and 106 importers landed on the same wrong file. A build-layout specifier is the same shape — a specifier no source-level resolver can satisfy — so it refuses and is recorded as dangling. Reading `tsconfig` rootDir/outDir would be modelling the build, which is the guessing ADR 0070 removed, in a more elaborate form
- [ ] Build it: an unresolvable build-layout specifier inflates DANGLING rather than silently making symbols look dead. Original framing kept below for the detail it carries:
      read `tsconfig` `rootDir`/`outDir`/`paths` and map the specifier back to source, or record the
      unresolvable specifier as dangling so it inflates the dangling count instead of silently making
      symbols look dead. ADR 0070's rule points at the second: refuse to fabricate a target, but do not
      let the refusal read as evidence of death.

## Phase 2 — make the measurement repeatable

- [x] DONE — `tests/integration/features/prune-precision.test.ts`. A project whose truth is DECLARED in the test, scored on precision AND recall together (either alone is gameable: flag nothing, or flag everything). Four live symbols reached by four different mechanisms — static import, destructured dynamic import, dynamic import then `new`, and a barrel re-export — plus a genuinely dead one. Mutation-verified: starving the linker's alias map fails it
- [x] It found a defect on its first run, which is the point of declaring truth rather than reading it back: exported const VALUES are wrong in BOTH directions — an unused one is missed, and a used one is flagged `STALE_IMPORT`, a verdict telling the user to delete an import their code needs. Held in the fixture's `KNOWN_WRONG` group so the headline score stays honest and the gap can neither grow nor silently vanish. Filed as todo63
- [ ] The frozen subjects have never been driven at the MCP surface until today. Add a pass that runs
      the tool surface against them, so payload shapes and finding quality are checked against data
      that is not conducks' own.

## Noted, not chased

- [ ] `impact --direction upstream` on `loadKernelPrompt` also returns `uid`, a test helper defined at
      `prompt-loader.test.ts:11` that does not call it — the two are used in the same test block. May be
      the co-location-vs-dependency class todo38 addressed for `trace`/`context`, leaking into `impact`.
      One observation is not a pattern; look again when Phase 1 re-measures.
