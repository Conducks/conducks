# 0178 — the empty cells were hiding a defect
Status: Accepted
- Date: 2026-08-27
- Builds: 0175, 0176
- Enforced by: tools/benchmark/bench-prune.mjs

## Context

Two cells of the coverage matrix had no subject: **a JavaScript-primary codebase** and **a Python
monorepo**. Both had been recorded as needing codebases rather than code — acquisition problems, not
prune problems.

That was half right. A real subject was never available, but ADR 0175's benchmark can BUILD the shape,
and building it found a defect that had been invisible the whole time.

## Decision

**Two more scenarios, and the matrix is closed at the benchmark level.**

- **11, a JavaScript-primary codebase.** The three subjects hold 4, 1 and 5 `.js` files between them —
  configuration, not a codebase. Every JS claim rested on it sharing a parser with TypeScript.
- **12, a Python monorepo, cross-package.** Every monorepo finding to date is TypeScript. A package
  importing another package, with a barrel and a cross-package call, is where a shared core lives.

Labelled as fixtures, not subjects: they prove the rules hold on the shape, not that a real JS
codebase behaves the same way at scale.

## Consequences

- **Scenario 11 failed on its first honest run, and the defect was real.** A constant read only by a
  JavaScript class field — `held = FIELD` — was reported `STALE_IMPORT`, a verdict telling the reader
  to delete an import the code needs.

  The cause is ADR 0165's own constraint, one layer on. TypeScript spells that node
  `public_field_definition`, JavaScript spells it `field_definition`, and naming a node a grammar
  lacks invalidates the WHOLE query (ADR 0089) — so the TS spelling had to go in the TS/TSX-only
  block. **The consequence nobody checked is that the JS spelling was then captured nowhere.** Fixed
  in `javascript/queries.scm`; mutating it away fails scenario 11 and nothing else.

- Scenario 12 passed first time. Python's cross-package imports, `__all__` barrel and module-qualified
  call all resolve — the work in ADRs 0162, 0164 and 0167 covered the monorepo shape without a
  monorepo subject to prove it on until now.

- **Two scenarios were wrong before prune was, again.** 11 forbade a finding about `arrow`, which is
  exported and consumed only by its own file — `UNUSED_EXPORT` is exactly right there. And its first
  `Holder` used a constructor assignment rather than a class field, so it never tested the shape it
  was written for and passed while the defect stood.

- 12 of 12 pass. Subjects unchanged — scraper 49, sofie 172, orchestrator 245 — which is the proof the
  JS capture touched nothing that was already working. Suite 319 / 2,469; every oracle green.

**What the empty cells were actually costing.** They were filed as "needs a subject", and a defect sat
behind one of them for as long as the cell stayed empty. A gap in coverage is not neutral: it is a
place where a defect cannot be found, and the cost is paid whether or not anyone is looking.
