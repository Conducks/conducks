# todo64 — a local that shadows a renamed import is rebound to the import, producing a wrong edge
Status: todo
- Acceptance: a function-scoped declaration that shadows a renamed import resolves to ITSELF, while a call through the renamed import still resolves to the real definition — both asserted against a REAL parse, not a hand-built graph.

## Context

**This todo was filed with the wrong headline and the correction is the useful part.** It first said
`IntraLinker` block 3b was UNREACHABLE dead code, on the strength of starving its map and watching
1,827 of 1,829 tests still pass — the only failures being in the one test that hand-builds the
pre-fix graph. That measurement was real and the conclusion drawn from it was wrong: every fixture
used to reach it contained a destructured DYNAMIC import, and none contained a renamed STATIC one.

MEASURED on a two-file fixture with `import { realTarget as shadowed }`:

| | 3b live | 3b starved |
|---|---|---|
| `usesImport` -> `lib.ts::realTarget` | present | **gone** |
| `usesLocal` -> `lib.ts::realTarget` | present | gone |

So 3b is load-bearing: it is what resolves a call made through a RENAMED STATIC import
(`import { A as B }` … `B()`), which is ADR 0085's case. Deleting it would silently drop those edges,
and nothing in the suite would have said so — `renamed-binding.test.ts` drives the reflector, not the
linker, so it cannot see this. That gap is why the wrong conclusion survived a full-suite check.

## The actual defect

The second row of that table is a WRONG EDGE, and it is confidently wrong:

```ts
import { realTarget as shadowed } from './lib.js';

export function usesLocal(): number {
  const shadowed = () => 99;     // a genuine local declaration, shadowing the import
  return shadowed();             // calls the LOCAL — conducks says it calls realTarget
}
```

3b rebinds any edge whose target is a scope-local ATOM to the module-level alias of the same bare
name in that file. It cannot tell the two cases apart:

- the local IS the imported binding seen from inside a function — rebinding is correct
- the local is an INDEPENDENT declaration that shadows the import — rebinding is wrong

Before todo62 those were indistinguishable, because a destructured dynamic import minted an unscoped
module-level alias plus a scoped local, exactly like a shadow. Since todo62 the dynamic case emits a
SCOPED alias id that matches its node, and 3b is MEASURABLY no longer needed for it — the scored
fixture and a module-level dynamic import both resolve with 3b starved.

**Which block picks it up instead is an INFERENCE, not a measurement.** Block 3a (the "pure alias"
follow) is the obvious candidate and the reasoning is that the alias source is now a real node with an
outgoing ALIASES edge, which is exactly what 3a walks. Nobody has starved 3a to confirm it. Flagged
because this todo's first headline came from precisely this kind of unverified step, and the same
mistake twice in one record would be careless.

Wrong edges are the worst class this codebase produces (ADR 0095): `impact` answers with a caller
that does not call, `prune` sees a use that is not one, and nothing counts it.

## Phase 0 — decide the discriminator before touching the rebind

- [ ] Establish what distinguishes a local that IS the binding from a local that SHADOWS it, at the graph level. A genuine declaration has its own definition site; the destructured binding's "declaration" is the import itself. If the reflector already records that difference, the rebind gains a condition; if it does not, this needs a capture before it needs a linker change
- [ ] Confirm the blast radius on a frozen subject before and after: how many rebinds does 3b perform on sofie, and how many survive the discriminator? A rebind count that barely moves means the shadow case is rare and the fix is cheap; a large drop means static aliases are being resolved through it constantly and the change needs its own measurement
- [ ] Confirm which block actually resolves the dynamic case now, by starving 3a the way 3b was starved. The claim above is reasoned, not measured, and the cost of being wrong is a "fix" aimed at the wrong block
- [ ] Whatever lands, it is asserted against a REAL parse. `dynamic-import-scoped-alias.test.ts` hand-builds its graph and therefore froze the producer's shape at the moment it was written — it agreed with the code for nine days after the parser stopped emitting that shape. The shadowing case above belongs in a fixture that runs `analyze`
