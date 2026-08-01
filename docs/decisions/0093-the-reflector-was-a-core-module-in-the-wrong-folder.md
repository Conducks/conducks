# 0093 — the reflector was a core module in the wrong folder
Status: Accepted
- Date: 2026-08-02
- Builds: 0048
- Enforced by: tests/architecture/boundaries.test.ts (`GRANTED_EXCEPTIONS` is now empty, and the matcher must refuse the edge it used to grant)

## Context

The layer contract had exactly one granted exception: `pulse-worker.ts`, which lives in core,
importing `ConducksReflector` from domain. It was defended carefully and the defence was internally
sound — the worker is a PROCESS ENTRY POINT, spawned standalone as a thread, fork or child process,
so nothing can be injected across the process boundary. The worker must construct what it runs.
Making the import dynamic had hidden the edge from the graph-based rule without removing it.

`core/parsing/MODULE.md` described it as "a real violation, not a type-erasure artefact" and named
two ways out: move the reflector into core, or invert it behind a contracts-level port. Both were
called real options, neither free — "which is why this is a decision rather than a TODO".

**The decision was never needed.** The reflector's imports are:

`types/capture-tags`, `core/algorithms/entropy`, `core/git/chronicle-interface`,
`core/graph/boundary-classifier`, `core/parsing/*` (context, grammar-registry, prism-core, four
processors, providers, taxonomy, built-ins, next-routes), `core/utils/path-utils`, and three node
builtins.

Not one domain import, static or dynamic. It was never a domain module that core needed. **It was a
core module filed under `domain/analysis/`**, and every argument about process boundaries and
dependency inversion was answering a question that did not exist.

## Decision

**Move `reflector.ts` from `domain/analysis/` to `core/parsing/`, and grant no exceptions.**

No injection, no port, no dynamic-import workaround. The edge is gone because the dependency was
never real.

`GRANTED_EXCEPTIONS` is kept as an EMPTY array rather than deleted, with the mechanism and its shape
still under test: an exception must name one file and one specifier. Granting the next one should be
a visible, reviewable diff — not a mechanism invented under pressure at the moment it is wanted.

## Consequences

- **Zero core → domain edges in the graph**, verified by querying the vault rather than by reading
  the rule. 1,284 tests green, `audit` green.
- 31 files updated. Fourteen of them are child-process test harnesses that build the import path as
  a runtime STRING, so a type-aware rewrite missed them and only running the suite found them — the
  same blind spot a refactoring tool would have.
- The lesson generalises past this file: **an architectural exception is worth re-deriving, not just
  re-justifying.** This one was argued from the worker's spawn model, which is a true fact about the
  worker and irrelevant to the question. Nobody had listed what the reflector actually imports, and
  that list was the whole answer.
- `core/parsing` is now the largest module by some margin, and `parsing` importing `git` and `graph`
  siblings is legal under the contract but worth watching — a core module that imports most of core
  is a candidate for splitting, not a violation.
