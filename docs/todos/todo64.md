# todo64 — a local that shadows a renamed import is recorded as calling the import
Status: todo
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

## Phase 0 — find the component that binds by name, before changing any of them

- [ ] Identify what actually produces the edge. 3b is ruled out by instrumentation; the next candidates are `context.registerLocalBinding` (ADR 0085 registers a renamed binding per FILE, and a per-file key cannot express a scope) and IntraLinker's own name lookup. Instrument each the way 3b was instrumented — a one-line `process.env`-guarded log at the mutation site, then a clean analyze — rather than reading the code and inferring
- [ ] Only then decide where the scope check belongs. `linker-intra.ts` already documents "INNERMOST SCOPE FIRST — a local declaration shadows a module-level one of the same name" for its dot-path receiver lookup, so the rule exists in the file and is simply not applied on this path
- [ ] Measure the blast radius on a frozen subject before and after: how many edges change, and does sofie's dangling/orphan count move? A shadowed import is uncommon in application code and this may be a handful of edges — which is worth knowing before spending a linker change on it
- [ ] The regression test runs a REAL `analyze` (`tests/integration/features/prune-precision.test.ts` is the pattern). `dynamic-import-scoped-alias.test.ts` hand-builds its graph, which is why it went on agreeing with the code for nine days after the parser stopped emitting that shape

## Measurement discipline this record cost

- [ ] Nothing else may run while a measurement is taken — no build, no test loop, no CLI in another shell. Two of the wrong conclusions above came from a contaminated vault, and a contaminated result does not look contaminated: it looks like a finding
- [ ] Prefer instrumenting the suspect over starving it. Starving answers "does the outcome change", which invites a causal reading; a log at the mutation site answers "did this code run, and on what", which is the question actually being asked
