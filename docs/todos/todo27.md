# todo27 — a fresh clone of conducks does not work
Status: todo
- Acceptance: `git clone && npm install && npm test` passes on a machine that has never built conducks, or fails with a message naming exactly what is missing — never by silently analysing at lower fidelity.

## Context

Tested on 2026-07-31 by deleting `.conducks/`, `build/` and every generated artifact, then starting
from the committed tree. The suite had been 751/751 green minutes earlier. From zero it was
**215 failed / 33 suites**, and reaching green again took three interventions nobody has written
down.

| step | result |
|---|---|
| `npm install` | reports success; the parser is silently disabled |
| `npm test` | **215 failed** |
| install `tree-sitter` by hand | 215 → 65 failed |
| `npm run build` again | 65 → 4 failed |
| `conducks analyze` | 4 → **0 failed, 751 passing** |

None of those three steps is documented, and the first two fail in ways that look like something
else. This is the first-run experience of a tool that has never been released, so nobody has hit it
yet — and everybody would.

## Phase 1 — the parser disappears without saying so
- [ ] `tree-sitter` (the RUNTIME, not the grammars) is an `optionalDependency`, so when npm skips it the install still reports success. All 13 grammars install; the engine they need does not. Analysis then degrades to the Gnosis regex fallback and produces a graph that looks real and is not — MEASURED: the PHP suite went from 8 expected symbols to 1
- [ ] `doctor` DOES report this correctly (`Parse path: Gnosis regex fallback — the native tree-sitter binding did not load`), so the diagnosis exists and nothing consults it. Decide where it must be consulted: a postinstall check, a first line in `analyze`, or a hard failure
- [ ] Decide whether the runtime should be a real `dependency` rather than optional. The grammars are genuinely optional — a missing Rust grammar costs Rust support. The runtime is not: without it, every language degrades at once. That asymmetry is not currently expressed
- [ ] Fixed when an install that cannot provide the native parser either fails loudly or prints a warning that names `tree-sitter`, and a test asserts the warning fires when the module is absent

## Phase 2 — the build reports success after emitting broken output
- [ ] Building while `tree-sitter` was missing left **16 files carrying unresolved `@/` imports** — `tsc` failed, so `tsc-alias` never rewrote them, and the chain still produced a `build/` directory. Every integration test then died on `Cannot find package '@/registry' imported from build/src/interfaces/cli/index.js`, which names the symptom and not the cause
- [ ] A clean rebuild fixed it, 16 → 0. So the output is correct when the inputs are; the defect is that a partial build is indistinguishable from a complete one
- [ ] Fixed when `npm run build` either refuses to leave a `build/` containing an unresolved `@/` specifier, or a postbuild check greps for one and fails. Verify by deleting a dependency, building, and watching it go red

## Phase 3 — a test that cannot pass on a clean checkout
- [ ] `tests/database/ts/structural.test.ts` opens `.conducks/conducks-synapse.db` read-only and fails with `database does not exist` when there is no vault. It audits the REAL vault, which is a legitimate thing to want, but it means CI is red on a fresh clone before anyone has written a line
- [ ] Decide which it is: a test that should build its own fixture vault, or a diagnostic that should skip with a stated reason when no vault exists. It must not stay a hard failure that everyone learns to ignore — todo22#P11 already records what a tolerated red suite costs here
- [ ] Fixed when the full suite passes on a checkout where `conducks analyze` has never run
