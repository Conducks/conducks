# 0175 — a benchmark asks for the shape an oracle cannot
Status: Accepted
- Date: 2026-08-27
- Builds: 0160, 0169
- Enforced by: tools/benchmark/bench-prune.mjs

## Context

`prune` had six oracles and three levels of ADR 0160's method, and had still been called finished
three times and been wrong twice. Each miss came from a shape the subjects did not contain — an
oracle scores what it finds, and cannot ask for what is absent.

## Decision

**Ten scenarios, each a fixture built on purpose, each with its ground truth written down.**

Every scenario states BOTH halves — what must be flagged and what must not — because a detector that
flags everything passes one half and a detector that flags nothing passes the other. Each is a defect
this repository shipped or a rule it holds, and the numbers in each `why` are measured.

| # | scenario | pins |
|---|---|---|
| 01 | dead module-level function | the base claim |
| 02 | export consumed only by its own file | `UNUSED_EXPORT` says "by OTHER modules" |
| 03 | single-binding stale import | the shape the retired calibration guard could never report (0163) |
| 04 | an unused import must not launder a dead symbol | scraper 23 → 22, symbol vanished (0162) |
| 05 | an unimported file is a QUESTION | disconnected vs never-wired (0104) |
| 06 | a Python barrel republishes through `__all__` | 11 findings, 8 of them re-exports (0162) |
| 07 | a module reached through its package, and a namespace import | 8 false ORPHANs each (0161, 0167) |
| 08 | every bare-value read position | 13 for a class field, 6 for a template substitution (0165–0167) |
| 09 | dispatch, decorators, entry points | the delete-verdict-on-live-code prune refuses |
| 10 | a class member is never judged | pins the documented blind spot so it cannot drift |

## Consequences

- **10 of 10 pass**, and the suite is proved by mutation rather than by passing: removing the barrel
  rule fails 06, the spread and subscript captures fail 08, `ONLY_IMPORTED` fails 04, restoring the
  calibration guard fails 03, and the TS namespace capture fails 07 on both its assertions.
- **Three scenarios were wrong before prune was.** The first run scored 7/10 and every failure was
  the fixture: 04 demanded that EVERY finding about a symbol be a question when `STALE_IMPORT` and
  `ONLY_IMPORTED` are both true at once; 05 built a file that references nothing, which the rule's own
  words make judgeable; 07 asserted on a bare symbol name in the one scenario that plants a collision
  on purpose. A benchmark is a claim about the tool and gets checked like one.
- **Two more were vacuous and were strengthened.** 03 imported its stale binding from a module it
  also used, and the retired guard is keyed per (file, specifier) — so a used sibling lifted it and
  the scenario passed with the defect restored. 06 asserted "no verdict" when the regression produces
  a QUESTION, which is not a verdict.
- **Scenario 07's Python half is asserted but not proved here, and says so.** Three attempts to make
  it bite in a small fixture failed, because the intra-linker rebinds the dangling name; it is proved
  on the subject instead, where `oracle-python-dead.mjs` reports 8 EXTRA when that binding is removed.
- `npm run bench:prune`. Full gate green beside it: seven oracles, 319 suites / 2,469 tests.

**What this closes.** prune now has three independent kinds of check: oracles scoring it against
compilers on real subjects, planted defects and counter-cases on those subjects, and this suite
asking for shapes no subject may contain. The known limits are unchanged and stated — class members
are never judged (scenario 10 pins it), and no subject exists for a Python monorepo or a
JavaScript-primary codebase.
