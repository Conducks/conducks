# todo71 — utils behind one door, and the five leaves under parsing pinned
Status: done
- Acceptance: nothing outside `core/utils` imports past `core/utils/index.ts`, every symbol the door exposes is documented and pinned by a test that fails when its behaviour is broken, and the four oracles read the same numbers as before.
- On close (2026-08-16): met. Zero files reach past the door in `src/` or `tests/`, 24 doc gaps became 0 real ones, `path-utils` went from no test to 12 cases with three biting mutations, and four oracles read unchanged.

## Context

Builds ADR 0150. Second feature through the method, and the next one parsing depends on — 13 parsing
files reach `path-utils`, so it is cleaned before parsing rather than after.

Measured before starting: five files, 464 lines, and it imports NOTHING — a true leaf like `core/git`
was. 30 external importers, concentrated on `logger` (17) and `path-utils` (6).

**24 of 37 symbols carry no doc comment**, and only 5 of those are the UNIT nodes the harvester
structurally cannot reach (todo69). So 19 are real gaps — over half the feature — and they are whole
files at a time: every method of `Logger`, every symbol in `mem-trace`, every symbol in `scope-guard`,
every symbol in `source-line`.

Test coverage is thinner than git's was: `path-utils` and `mem-trace` are named in NO test at all,
and `path-utils` is the one parsing depends on.

Behaviour does not change during a clean (rule 16). Anything found wrong is recorded for its own
commit with its own measurement.

## Phase 0 — read before touching
- Builds: 0150
- [x] all five read. Every claim and every failure answer is in `docs/deep_clean.md`
- [x] measured: every exported symbol has an external caller. Nothing dead, so rule 7 needed no removal — unlike `core/git`, where two methods went
- [x] it guards `analyze` against a root that is not one project — a home directory, a repo-parking folder, a `node_modules`. It never refuses; it returns a level and its reasons and the caller decides, which is why it is usable in unusual layouts. Enforced by ADRs 0021, 0039 and 0069, whose `- Enforced by:` paths this todo had to repoint

## Phase 1 — the door
- Builds: 0150
- Depends: todo71#P0
- [x] the door exports nine symbols and three types; `Logger`'s sink, `SourceLineReader`'s cache and `scope-guard`'s marker tables stay inside
- [x] zero. The path-shaped rewrite reached 21 files and the gate found three more — `graph-engine` importing `../utils/logger.js`, and two test files. Second feature running, second time a text rewrite left importers behind
- [x] both, and the test half is what surfaced that `scope-guard.test.ts` and `root-discovery.test.ts` were filed outside the module they test

## Phase 2 — clean behind it
- Builds: 0150
- Depends: todo71#P1
- [x] 24 undocumented became 0 real gaps. Four of five files had a long block attached to the WRONG symbol — above a module variable, above an interface, above two static fields — the same defect `core/git` had twice. A second harvester limit surfaced: one block documenting a GROUP attaches to its first member only
- [x] none to remove — measured above
- [x] none contradicted; they were misplaced rather than false

## Phase 3 — make it break
- Builds: 0150
- Depends: todo71#P2
- [x] 12 cases, including the property stated as a property: one file spelled four ways collapses to ONE id
- [x] covered for `path-utils`; `source-line`'s past-end and unreadable cases were already pinned by its existing suite, which is why they are not duplicated
- [x] three mutations, three failures: dropping the lowercasing, dropping the empty-string guard, and lowercasing the DISPLAY path — which must not be lowercased, because such a path opens nothing on a case-sensitive filesystem

## Phase 4 — close it honestly
- Builds: 0150
- Depends: todo71#P3
- [x] 1,952 tests / 257 suites, four oracles green, typecheck 0, docs-lint clean at 188 — after repointing three ADRs whose `- Enforced by:` named the tests this todo moved
- [x] recorded
- [x] 14 PASS, 2 n/a, 1 open — rule 4, because `logger` is a process sink whose static quiet flag is static ON PURPOSE. Same decision `chronicle` waits on
