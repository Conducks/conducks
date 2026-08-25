# 0161 — a namespace import names a module, not nothing
Status: Accepted
- Date: 2026-08-26
- Builds: 0070, 0085, 0160
- Enforced by: tests/integration/features/namespace-import-binding.test.ts

## Context

`import * as headers from './headers'` bound nothing at all.

Named imports had a per-binding capture and default imports had one (ADR 0085's work). The namespace
form had neither, so the alias never entered the binding map. Two consequences, and only the first
was ever looked for:

- `headers.applySecurityHeaders(h)` — a CALL whose receiver resolved to no module, so the target
  fell through to a bare name and dangled.
- `analytics.trackPageView` — a READ, used as a value in a wrapper object. `@ref_value` captures the
  OBJECT of a member expression and marks it used, which is right for an enum or a const table where
  the property is not a symbol. For a namespace alias the property IS a symbol, in another file, and
  nothing recorded it.

Found by todo77#P1 — the L1 baseline of ADR 0160's method — on the orchestrator subject:

| | |
|---|---|
| `prune` verdicts scored mechanically | 327 across three subjects |
| false positives found | **8, all on orchestrator** |
| `impact upstream` on the first of them | 0 callers, having examined 27,277 edges |
| sofie / scraper | 0 namespace imports, so 0 of the defect |

The eight were `withSecurityHeaders`, `withRateLimit`, `withInputValidation`, `trackPageView`,
`trackAction`, `startLLMRequest`, `completeLLMRequest`, `logLLMRequest` — every one reached only
through a barrel that namespace-imports its own siblings, which is idiomatic in a monorepo `core`
package and appears nowhere in either single-repo subject.

**Rounds 5 and 6 hand-checked roughly 40 of ~400 findings and the sample missed all 8.** That is how
"prune has zero false positives" survived two rounds, and it is the specific claim ADR 0160 was
written to stop being made from a sample.

## Decision

**A namespace alias is registered as a binding to its MODULE, and marked as a namespace so it is not
mistaken for a symbol.**

Three parts, and each is a fact the source states rather than an inference:

- The grammars capture `(namespace_import (identifier))` for TypeScript and TSX. `Context` keeps
  namespace aliases in their own set alongside `localBindings`, because the two resolve differently:
  a symbol binding contributes its own name to the target id (`Class.method`), a namespace alias
  contributes nothing (`headers.apply` is `<headers.ts>::apply`, never
  `<headers.ts>::headers.apply`, which is an id no node is keyed by — the dangling shape ADR 0085
  fixed for renamed bindings).
- `CallProcessor` drops the alias segment when the head is a namespace.
- A member READ resolves its property **only when the object is a namespace alias**. For anything
  else the property is left alone exactly as before, because an enum member or a const-table key is
  not a symbol and minting an id for one is the fabrication ADR 0070 refuses.

## Consequences

- Measured on the three subjects, cold analyze each time:

  | subject | before | after | note |
  |---|---|---|---|
  | scraper | 23 | 23 | no namespace imports — safety check |
  | sofie | 138 | 138 | one namespace import, no members read |
  | orchestrator | 239 | **230** | the 8 above, plus `ADMIN` in `scripts/qa/client.mjs` |

  **Nothing was ADDED on any subject.** The whole delta is removal of false positives.
- Full suite green: 317 suites, 2,435 tests.
- **The namespace gate on the member-read rule is proved by measurement, not by a test.** Removing it
  costs one TRUE finding on orchestrator — `generateFingerprint` in `analytics/server/index.ts`,
  which is genuinely dead and distinct from the `SessionSentinel.generateFingerprint` that every
  other mention refers to. Two attempts to reproduce that in a fixture both failed: a LOCAL object
  never enters the binding map, so the `!nsPath` guard catches it and the gate is never the thing
  under test; and a cross-file name collision is rescued by the intra-linker before the gate is
  reached. So the gate has a measured justification on a real subject and **no test that bites for
  it** — recorded here rather than left as a line whose purpose cannot be shown.
- The call-side change in `CallProcessor` is likewise not independently proved: mutating it alone
  leaves the suite green, because a dangling `<path>::alias.member` id is repaired afterwards by the
  intra-linker's name matching. It is kept because producing the exact id directly is a fact, while
  the repair is a name coincidence of the kind ADR 0070 governs — but the honest status is that the
  registration is what the tests hold, and this line rides with it.
- **Python is unaffected and untested here.** It has no `import * as` form; `import numpy as np`
  is an aliased import and already had a capture.
