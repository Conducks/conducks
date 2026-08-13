# todo64 — a local that shadows a renamed import is recorded as calling the import
Status: done
- Acceptance: a function-scoped declaration that shadows a renamed import resolves to ITSELF, while a call through the renamed import still resolves to the real definition — both asserted against a REAL parse, not a hand-built graph.

## Context

**This record has carried two wrong headlines. Both are kept, because the way they were reached is
the most useful thing in it.**

1. *"`IntraLinker` block 3b is unreachable dead code."* Reached by starving 3b's map and watching
   1,827 of 1,829 tests pass, the only failures being in the one test that hand-builds the pre-fix
   graph. The measurement was clean; the conclusion did not follow. A green suite while a path is
   starved proves the SUITE does not cover it, never that the path is unused.
2. *"3b is load-bearing — starving it deletes the edges for a renamed static import."* Reached by
   starving 3b and seeing both edges vanish from the fixture. **That run was contaminated**: a
   full-suite loop was running in another shell and `npm run build` had just wiped `build/` under it,
   so the analyze produced nothing. The empty result read exactly like a meaningful one.

Re-measured cleanly, nothing else in flight:

| | 3b live | 3b starved |
|---|---|---|
| `usesImport` -> `lib.ts::realTarget` | present | **present** |
| `usesLocal` -> `lib.ts::realTarget` | present | **present** |

and 3b, instrumented to log every rebind it performs, logs **nothing** on this fixture. So 3b neither
causes the defect below nor resolves the renamed-import call. It is exonerated, and what it does
carry is still unestablished.

## The defect, which is real and reproduced cleanly twice

```ts
import { realTarget as shadowed } from './lib.js';

export function usesLocal(): number {
  const shadowed = () => 99;     // a genuine local declaration, shadowing the import
  return shadowed();             // calls the LOCAL — conducks says it calls realTarget
}
```

The graph records `usesLocal -> lib.ts::realTarget`. It is a wrong edge at full confidence, and wrong
edges are the worst class this codebase produces (ADR 0095): `impact` answers with a caller that does
not call, `prune` sees a use that is not one, and nothing counts it.

The two cases are distinguishable in the graph, which is what makes a fix plausible — MEASURED on the
fixture, the genuine local IS a node (`main.ts::usesLocal.shadowed`, BEHAVIOR/function, L4) while the
reference-induced one is not a node at all. Scope information exists; something is resolving by name
without consulting it.

## Phase 0 — find the component that binds by name

- [x] FOUND by instrumentation, not by reading: `CallProcessor.process` resolves a call through `context.resolveLocalBinding(name)` (`processors/call.ts:62`), and `localBindings` is a `Map` keyed by NAME PER FILE with no notion of scope. A one-line `process.env`-guarded log at the resolution site printed `[BIND] shadowed -> lib.ts::realtarget` TWICE on the two-function fixture — once for the call through the import (right) and once for the call to the local (wrong). One lookup, no scope, both answers the same
- [x] 3b is exonerated and stays. Instrumented the same way, it logs nothing on this fixture

## Phase 1 — let the innermost declaration win

- [x] BUILT as IntraLinker block 3c, post-hoc where the whole graph is known, rather than in the call processor — matches are not ordered, so a same-pass check cannot know whether the local's node exists yet. The edge carries the name it was written with in `properties.original`, and a declaration mints `<file>::<scope>.<name>`, so the rebind is decided by EXISTENCE
- [x] It fixes more than the shadowed import. On the python subject it also corrects a call in `_merkle_diff` that was bound to `_render_markdown.walk` — a DIFFERENT function's local — and two `level_class` cases in `flow_engine.py`. Verified against the source: each caller declares its own
- [x] TWO guards, each added because a measurement caught the fix being wrong:
- [x] Guard 1, CASE. Ids are lowercased for APFS (CONDUCKS-4), so `Path` imported from pathlib and a local `path` share one id. The first cut rebound **37 edges on the python subject**, including `pathlib::Path` onto a local `path` and `graph.py::Node` onto a local `node` — the wrong-edge defect reintroduced from the other side. The names as WRITTEN are compared now
- [x] Guard 2, ALIAS BINDINGS. A destructured import (`const { X } = await import(...)`) is ALSO a scoped node with a matching name, and it must not win — it IS the import. todo62 made it a real node, which is what made it indistinguishable by shape. It carries an outgoing ALIASES edge and a genuine declaration does not. Caught by the prune-precision fixture, which reported three live symbols as dead
- [x] `tests/integration/features/scope-shadowing.test.ts` drives a REAL analyze. Both halves mutation-verified separately: starving the rebind fails the shadow case, dropping the case guard fails the collision case. The first mutation attempt broke the BUILD and its red was therefore meaningless — a type-safe mutation is the only kind that proves anything here
- [x] MEASURED on the frozen subjects: scraper +2 nodes, orchestrator +7, sofie +17, and **dangling unchanged on all three**. The nodes are locals that a correct rebind now references, so they survive the ATOM edge gate. `located` stays 100%. Baselines re-saved, warm and cold
