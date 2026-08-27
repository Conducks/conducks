# 0167 — fresh code is the only honest test
Status: Accepted
- Date: 2026-08-27
- Builds: 0166
- Enforced by: tests/integration/features/dead-import-laundering.test.ts

## Context

todo77#P1 closed with both stale-import oracles exact and 326 verdicts scored at zero false
positives. Then the subjects were pulled to latest, and the numbers were re-run against code conducks
had never seen:

| subject | before | after the pull |
|---|---|---|
| sofie | 437 ts · 67 tsx · 5 py | 497 ts · 69 tsx · 9 py |
| scraper | 167 py · 1 js | 235 py · 27 js · 6 mjs |

**Four defects appeared, three of them in Python** — the language whose value-position set was
written separately from the ecmascript one, and which therefore never received ADR 0165's work.

## Decision

Four captures, each added because a measured false finding demanded it.

| shape | example | cost of omitting |
|---|---|---|
| keyword argument in a CLASS header | `class SofieConfigFlow(ConfigFlow, domain=DOMAIN)` | 1 false stale import on sofie |
| bare assignment right-hand side | `_COMPOUND_TLD = COMPOUND_TLD` | part of 5 on scraper |
| comparison operand | `return status in EXECUTABLE_TIERS` | part of the same 5 |
| **a module imported from its package** | `from pkg import page_source` then `page_source.capture_dom(...)` | **8 false ORPHANs on scraper** |

The first three are Python twins of positions ADR 0165 had already closed for TypeScript. The class
header is its own node: the superclass list is an `argument_list` like a call's, but it hangs off
`class_definition`, so the existing keyword-argument pattern never reached it.

The fourth is the Python twin of ADR 0161's namespace import, and it reuses that machinery.
`from pkg import submodule` binds a MODULE; the branch that recognised this pushed an `IMPORTS` edge
and **bound nothing**, so the alias still resolved to the PACKAGE and the call became
`<__init__.py>::page_source.capture_dom` — an id no node is keyed by. `registerNamespaceBinding` now
takes the resolved submodule, and `registerLocalBinding` declines to overwrite a namespace binding,
because the per-binding loop runs afterwards and would rebind the name back to the package.

## Consequences

- Measured on the updated subjects, cold:

  | subject | findings | note |
  |---|---|---|
  | scraper | 57 → **49** | eight false ORPHANs removed; 43 verdicts scored, 0 false positives |
  | sofie | 173 → **172** | the `DOMAIN` false positive removed |
  | orchestrator | **245** | unchanged by these fixes |

- Both stale-import oracles remain exact — TypeScript `27 → 0 missed`, Python 0 missed / 0 extra —
  now measured against substantially larger subjects. Full suite 319 suites / **2,466 tests**.
- **The module binding is proved on the SUBJECT, not by a fixture, and that is stated rather than
  papered over.** The test was written twice — once asserting through `prune`, once through
  `impact` — and passed with the binding mutated away both times, because in a fixture that small the
  intra-linker rebinds the dangling name to the only `capture_dom` in the graph. It was deleted
  (Rule 10: a test that passes either way reports as coverage and proves nothing). Mutating the
  binding away on scraper takes it from 49 findings to 57 and returns the eight false ORPHANs.

### What this says about the method

ADR 0160 built three levels — baseline, planted defects, planted counter-cases — and all three ran
on frozen subjects. **A frozen subject cannot surface a shape it does not contain.** Every one of
these four defects was invisible to 326 scored verdicts, ten mutation-proved mechanisms and two exact
oracles, and became visible the moment the subjects moved.

The oracles are what made it cheap: `oracle:python` named all five of its findings against Python's
own parser in one run, with no hand-reading. **A subject refresh is now part of the method**, not an
accident of this session — and it is the cheapest adversarial pass available, because someone else
writes the code.
