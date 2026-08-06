# 0143 — a refusal is not a silence
Status: Accepted
- Builds: 0016, 0070, 0137
- Date: 2026-08-07
- Enforced by: tests/integration/features/type-only-imports.test.ts (the Python half fails without the boundary refusal, because `from typing import ...` binds into the repo's own `typing.py`)

## Context

`ImportProcessor.resolve` asks the language provider first (ADR 0137: resolution beats
classification), and reads `undefined` as "I could not resolve this" — which lets the generic
fallbacks try, ending at a basename match. That is right for a provider that genuinely does not
know, and wrong for one that is REFUSING.

`PythonResolver` refuses the standard library deliberately: `typing` is a boundary, never a file in
the tree. It expressed that refusal as `undefined`, which is the same token as ignorance, so the
basename fallback ran anyway — and the frozen Python subject contains
`src/core/browser/human/typing.py`. Every `from typing import Optional` in that repository bound to
it. MEASURED: **316 dangling IMPORTS edges**, all pointing into that one file, and the type-only
marking that todo48#P3 was about could not be right either, because the binding it marked was
attributed to a local module that never defined those names.

## Decision

A provider may state a boundary directly: optional `isBoundaryModule(specifier): boolean` on the
provider contract, implemented by Python as its standard-library set. It means "this is not in the
tree and never will be", as distinct from `resolveImport` returning undefined.

A declared boundary REFUSES THE BASENAME FALLBACK and falls through to induction — the same
treatment `declaredExternal` already gives a manifest-declared package, and for the same reason.
It does NOT short-circuit into an `external_dependency` result.

That last sentence is the whole decision, and it was learned the expensive way twice. The comment
above the external-package branch already records the first time: collapsing external imports to
package level took mentorseed from 5,997 nodes to 3,182, with the dangling COUNT improving while
the RATE worsened — the shape of a denominator being destroyed. Implementing this ADR by
short-circuiting repeated it precisely: **5,062 nodes → 819** on the frozen Python subject, a
graph collapse presented as a 4-point dangling improvement. The warning was written at the exact
line the wrong edit was made, and reading it is what named the mistake.

## Consequences

- MEASURED on the frozen Python subject, correct form: dangling **2,106/16,746 (12.58%) →
  1,411/17,311 (8.15%)** — 695 fewer wrong edges while the edge count GREW by 565. Count down and
  rate down against a growing denominator is the opposite of the collapse shape above, and is the
  only pattern that should be read as a precision win.
- Nodes 5,062 → 5,293: stdlib symbols now induce `lib::<pkg>::<symbol>` instead of binding to a
  local file, which is what keeps "who imports `Optional`" answerable at symbol level.
- Any provider may adopt the hook. Only Python implements it today; TypeScript's resolver has no
  equivalent guaranteed-absent set (`node:` builtins are already handled as externals upstream).
- The general rule this states, beyond imports: an authority that says NO must be able to say it in
  a way a caller cannot mistake for saying nothing.
