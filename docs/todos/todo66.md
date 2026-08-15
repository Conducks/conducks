# todo66 — a specifier that only resolves through the build layout leaves the target's exports looking dead
Status: todo
- Acceptance: on subject-c, `globalPromptPath`, `kernelPromptPath`, `agentRoutingPath`, `TOOL_REGISTRARS`, `computeEffectiveSignificance` and `readAgentRoutingPrompt` are NOT reported by `prune`, because the import that consumes them resolves — measured, not asserted.
- Builds: 0026

## Context

Split out of todo58 on 2026-08-15 rather than closed with it. todo58's acceptance was about the
DYNAMIC import form and is met — `MacOSAdapter` and `LinuxAdapter` are no longer reported and
`MacOSAdapter` has 7 upstream callers. Six symbols it named are still flagged, and they are flagged
for a DIFFERENT reason, which todo58 Phase 1 identified and deliberately declined to fix. Closing
todo58 without carrying that reason forward would bury it.

The shape, measured on subject-c:

```
electron/main/index.ts:1199
  const { agentPromptPath, kernelPromptPath, globalPromptPath, agentRoutingPath }
    = await import('../engine/executor/prompt-loader.js');
```

`electron/engine/` does not exist. The file is `src/engine/executor/prompt-loader.ts`, and the
mapping from one to the other lives in the project's build configuration, not in the specifier. So
the import never resolves, nothing links the consumer to the definitions, and every export of that
file reads as unconsumed:

| symbol | reported as | truth |
| --- | --- | --- |
| `globalPromptPath` | UNUSED_EXPORT | called at `electron/main/index.ts:1216` |
| `kernelPromptPath` | UNUSED_EXPORT | destructured at `:1199` |
| `agentRoutingPath` | UNUSED_EXPORT | destructured at `:1199` |
| `computeEffectiveSignificance` | UNUSED_EXPORT | same file, same shape |
| `readAgentRoutingPrompt` | ORPHAN | called at `electron/main/index.ts:1319` |
| `TOOL_REGISTRARS` | UNUSED_EXPORT | destructured at `:1126`, iterated at `index.ts:92` |

Six false verdicts from one unresolved specifier — and `readAgentRoutingPrompt` is an ORPHAN, the
strongest wording `prune` has.

## Phase 0 — decide what "modelling the build layout" means before writing any of it

- [ ] The declared source is a `tsconfig`/bundler `paths`/`rootDir` mapping, which is a FACT the
      project states rather than something to infer. ADR 0070 forbids fabricating a target from a
      coincidence; reading a declared mapping is not that, and todo58 already recorded this reasoning
      after getting it wrong once
- [ ] PRICE IT the way todo31 was priced — which resolvers change, what happens when no config
      declares a mapping, and whether a wrong mapping can bind a symbol to the WRONG file. A wrong
      edge is worse than a missing one here, because it would make `prune` confidently silent
- [ ] Check whether the same shape appears in the other two subjects, or only where an Electron main
      process reaches into a sibling source tree. One subject is not a pattern

## Phase 1 — the measurement that decides it worked

- [ ] The six symbols above are the fixture. They are named, their call sites are known, and the
      count is falsifiable: six wrong today, zero when this is done, and no NEW findings appearing
      elsewhere on the three subjects
- [ ] Add the shape to `prune-precision.test.ts` — a file importing through a specifier that only
      resolves via a declared mapping. Truth declared in the test, so it cannot pass by the mapping
      being absent
