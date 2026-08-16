# todo69 — git behind one door, and the method proven on it first
Status: doing
- Acceptance: nothing outside `core/git` imports past `core/git/index.ts`, every operation the door exposes is documented and pinned by a test that fails when its behaviour is broken, and the four oracles read the same numbers as before the campaign.

## Context

Builds ADR 0150 on the smallest self-contained feature, deliberately, before the largest one.

`core/git` imports NOTHING — zero `@/` dependencies — so it is a true leaf and rule 13 puts it
first. It is one file, 973 lines, 35 methods of which 20 are public, reached from 8 places outside
itself. 15 of its 44 symbols carry no doc comment, including the file header and every private
helper (`git`, `config`, `refExists`, `revParse`, `mergeBase`, `isAncestor`, `localBranches`,
`toRepoRelative`, `isInsideProject`).

Parsing was going to be first and should not be: it depends on `types/language-plugin` (13 files),
`graph/adjacency-list`, `graph/external-nodes` and `utils/path-utils`, so cleaning it first would
build on a foundation nobody had verified. todo68 now waits on this todo.

The second reason to start here is that the METHOD is unproven. Sixteen rules, a boundary test that
does not exist yet, and gates after every unit — all of it is theory until it has been run once end
to end. Running it on one file costs a session; running it first on 69 files costs a month before
anyone learns whether the shape works.

Behaviour does not change during this clean (ADR 0150 rule 16). Anything found wrong is recorded and
left for its own commit with its own measurement.

## Phase 0 — read before touching
- Builds: 0150
- [ ] Read all 973 lines and list every claim the file makes — what each public method promises, and what it promises when git is absent, the repo is bare, or the command fails
- [ ] Name which of the 20 public methods have NO caller outside `core/git`. `getProgenitors`, `getCommitResonance`, `getAuthorDistribution` and `getBlameData` are the candidates — measure rather than assume, because a method used only by a test is not used
- [ ] Decide what the door exposes. A method with no caller is either dead (rule 7) or an unused capability, and the two have different answers — say which each is and why

## Phase 1 — the door
- Builds: 0150
- Depends: todo69#P0
- [ ] `core/git/index.ts` exports exactly what the 8 external importers use, and they all point at it
- [ ] a test fails when a file outside `core/git` imports an internal path — proven by adding a violation and watching it fail, not by watching it pass
- [ ] the count of files reaching past the door is zero, measured the same way the 8 was measured

## Phase 2 — clean behind it
- Builds: 0150
- Depends: todo69#P1
- [ ] 15 undocumented symbols documented, file header included — each says WHY it exists, not what the line does (conducks-docs §6.14)
- [ ] dead code removed, justified by reading rather than by `prune`, whose recall was measured at 140 of 245 on the largest subject
- [ ] any comment contradicting its code is fixed — those are wrong, not stale

## Phase 3 — make it break
- Builds: 0150
- Depends: todo69#P2
- [ ] adversarial cases for the door: no repository, a bare repository, a detached HEAD, a path outside the project, a file that is not tracked, a ref that does not exist, a branch name with a slash, a unicode path, a submodule boundary, and a git binary that is missing or fails
- [ ] every new test fails against a deliberately broken version — a test that passes either way is deleted, not kept
- [ ] what remains unverified is written down beside the numbers, not implied by their absence

## Phase 4 — prove the method, then hand it on
- Builds: 0150
- Depends: todo69#P3
- [ ] gates green: full suite, four oracles, typecheck, docs-lint
- [ ] `docs/deep_clean.md` records what changed, what was measured, and what is still unknown
- [ ] state whether the method itself worked — which of the 16 rules earned their place here, and which were noise on a feature this size. That answer changes how todo68 runs
