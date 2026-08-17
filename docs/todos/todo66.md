# todo66 — a specifier that only resolves through the build layout leaves the target's exports looking dead
Status: blocked
- Acceptance: on subject-c, `globalPromptPath`, `kernelPromptPath`, `agentRoutingPath`, `TOOL_REGISTRARS`, `computeEffectiveSignificance` and `readAgentRoutingPrompt` are NOT reported by `prune`, because the import that consumes them resolves — measured, not asserted.
- Builds: 0026
- Blocked by: only ONE of three subjects shows the shape, and nothing declares the mapping — Phase 0
  measured both. Clears when a SECOND subject shows a specifier that resolves only through the build
  layout, or when a project declares that mapping somewhere a resolver can read.
- DEFERRED 2026-08-15, before Phase 1 was started, on this todo's own bar. Phase 0 found that
  NOTHING declares the mapping — it emerges from two build configs — and that only ONE of three
  subjects has the shape. The defect is real and its cost is stated below; what is not justified
  today is a bundler-config reader per framework, whose failure mode is a wrong edge making `prune`
  confidently silent. Reopen when a SECOND subject shows it, or when a project declares the mapping
  somewhere a resolver can read.

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

- [x] RESEARCHED 2026-08-15, and the premise of this bullet is FALSE. **Nothing declares the
      mapping.** It was written assuming a `tsconfig`/bundler `paths`/`rootDir` entry could be read;
      there is none to read.
      MEASURED on subject-c: `findNearestTsconfig` from `electron/main/` finds
      **`electron/tsconfig.json`**, which declares no `baseUrl`, no `rootDir` and no `paths` at all.
      The ROOT `tsconfig.json` does declare `baseUrl: ./src` and `rootDir: ./src` — and explicitly
      **`"exclude": ["electron"]`**, so it is the config that states it does NOT govern these files.
      Borrowing its `baseUrl` for an electron file would mean using a declaration that says the
      opposite.
      The real mapping emerges from TWO configs at once: `tsc` emits `src/** → dist/**`, the bundler
      emits `electron/main → dist/main`, and only after both does `dist/main/… → ../engine/…` land on
      `dist/engine/…`. That is the build-layout modelling this todo priced as the expensive option,
      not a declared fact one resolver can read.
- [-] A small rule was TRIED and REVERTED — it cannot fire, because the nearest tsconfig declares no
      source root to retry against. The rule was: retry a climbing specifier's tail beneath the
      declared source root — verified by
      calling the resolver directly on `../engine/executor/prompt-loader.js`, `../plugins/tools/index.js`
      and `../kernel/index.js`, all still UNRESOLVED with the rule in place. Recorded so it is not
      re-attempted as an obvious first idea
- [>] PRICED — deferred because the price buys one layout and its failure mode is a wrong edge. It is
      not one resolver change: it needs a
      reader per bundler config (`electron.vite.config.ts` here, something else next time) plus the
      root `tsconfig` `rootDir`/`outDir`, and the two composed. When no config declares a mapping the
      answer must stay UNRESOLVED, which is today's behaviour — so the whole cost buys one layout.
      A wrong mapping binds a symbol to the WRONG file and makes `prune` silent about real dead code,
      which is worse than the six false verdicts it would remove
- [x] CHECKED 2026-08-15 — **only one subject has it.** Neither subject-a nor orchestrator declares a
      `rootDir` at all, and neither has a process reaching into a sibling source tree. On subject-c it
      is 8 distinct climbing specifiers from `electron/`, not just the 6 symbols above.
      This todo's own bar is written one line up: *one subject is not a pattern*. Combined with the
      finding that nothing declares the mapping, the honest status is NOT-YET rather than next-up —
      the cost is a bundler-config reader per framework, the risk is a wrong edge making `prune`
      confidently silent, and the evidence is one project's Electron layout
- [x] RE-MEASURED 2026-08-17 — **still one subject.** The reopen condition is a SECOND subject, so it
      is re-run rather than inherited. Every climbing specifier in all three subjects was resolved
      against disk: sofie **1,096 in code, 18 unresolved**, all from `electron/` and all the shape
      above; orchestrator **169 in code, 0 unresolved**; scraper is Python and has none. The blocker
      holds.
      The first run of that scan reported orchestrator as a second subject, and it was WRONG: the
      pattern matched `Prefer importing from '../shared/types'` inside a doc comment, while the file's
      real imports are `'../../shared/types'` and resolve. Recorded because the false positive would
      have cleared this blocker and authorised the expensive work — a measurement that reads prose as
      code is not a measurement, and it announced nothing. Comments are stripped before scanning now.

## Phase 1 — the measurement that decides it worked

- [>] Deferred with Phase 0 — waits on the decision above. The six symbols above are the fixture. They are named, their call sites are known, and the
      count is falsifiable: six wrong today, zero when this is done, and no NEW findings appearing
      elsewhere on the three subjects
- [>] Deferred with Phase 0 — there is no mapping to declare in a fixture yet. Add the shape to `prune-precision.test.ts` — a file importing through a specifier that only
      resolves via a declared mapping. Truth declared in the test, so it cannot pass by the mapping
      being absent
