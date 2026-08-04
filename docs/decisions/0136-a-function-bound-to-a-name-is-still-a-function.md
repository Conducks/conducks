# 0136 — a function bound to a name is still a function

Status: Accepted
- Date: 2026-08-04
- Builds: 0133, 0135
- Enforced by: tests/unit/core/parsing/arrow-function-is-a-function.test.ts

## Context

`export const Button: React.FC<Props> = (props) => { ... }` is how most of a React or Next.js
codebase declares its functions. Conducks recorded every one of them as `ATOM` — a variable — because
the grammar tags the node `@isVariable`, which is syntactically true and semantically wrong.

Measured on the frozen subjects (ADR 0135): orchestrator has 198 `.tsx` files and carried **128**
`BEHAVIOR` nodes across all of them, beside 123 PascalCase atoms. sofie carried 22.

This is not a labelling detail. `impact`, `prune`, `coverage` and `flows` all select on `BEHAVIOR`, so
a React codebase was largely invisible to the four commands this project leads with. Nothing reported
an error; the answers were simply thin, which is the failure mode that survives a command sweep.

The defect was found by the doc-fidelity checker built for todo44, which reported 76 declarations on
orchestrator where the author had written a doc and conducks had recorded **no symbol at that line**.
That number was the visible edge of a much larger miss.

## Decision

**A definition capture that carries a PARAMETER LIST declares a function, whatever the grammar calls
the node.** The evidence is the grammar's own: a `variable_declarator` whose value is an arrow
function captures `@params`, and a plain variable captures nothing. This is a rule about declarations,
not about React, so it lives in the reflector rather than in one language's query file — it holds for
every grammar that separates a binding from the function bound to it.

The rule is stated ONCE, in `kindFromCapture`. Two sites derive a kind from a capture name — node
creation, and the capture loop that overwrites it afterwards — and fixing only the first changed
nothing at all. The tests passed against the first fix because they exercised the second path.

Not adopted: a name-shape heuristic (PascalCase means component). It would misfile a PascalCase
constant, miss every lowercase handler, and encode a framework convention as a parsing rule.

## Consequences

Measured on the frozen subjects, `--force` on both sides:

| subject | BEHAVIOR before | after | doc fidelity before | after |
|---|---|---|---|---|
| orchestrator | 1,493 | 1,836 | 88.5% | 95.6% |
| sofie | 2,936 | 3,255 | 99.2% | 99.3% |
| scraper | 1,117 | 1,117 | 99.2% | 99.2% |

Python is unchanged, which is the expected result: it has no arrow-function form.

**110 nodes on orchestrator are NEW, not reclassified.** 233 atoms became behaviors, and 110 symbols
appeared that had no node at all before — handlers declared inside a component, such as
`ClarificationAlert.handleSubmit` and `ClarificationAlert.handleFileUpload`. A sample was checked
against the source and every one exists; the id diff removed nothing. **Why they were absent before is
not explained**, and it is filed as todo44#P4 rather than asserted here. An unexplained improvement is
still unexplained.

A second, smaller rule ships alongside: **a directive addresses the toolchain, not the reader.**
`debounce` on orchestrator was being served the text
`eslint-disable-next-line @typescript-eslint/no-explicit-any` as its documentation. It has letters, so
the banner rule of ADR 0135 does not catch it. The test is anchored to the START of the comment, so
prose that merely mentions a directive is still prose.

Four false attachments remain on orchestrator: a class-level JSDoc reaching a method declared beneath
it. That is a different rule and is not fixed here.
