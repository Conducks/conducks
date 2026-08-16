# todo72 — one contracts layer, not two, and a door on it
Status: done
- Acceptance: `src/types/` no longer exists, everything it held lives under `src/contracts/` behind one door, nothing outside imports past that door, and the four oracles read the same numbers as before.
- On close (2026-08-16): met, with one correction to its own premise — three of the five files were never contracts and went to their features instead of into `contracts/`. 15 PASS, 1 n/a, 0 open.

## Context

Builds ADR 0150. Third feature through the method, and the one parsing depends on most — 13 parsing
files import `types/language-plugin`, which is the single most-imported file in either folder.

**There are two contracts layers, and only one of them is declared.** ADR 0005 names
`contracts (src/contracts): shared interfaces/types. Imports nothing.` as the leaf of the layer
contract. `src/types/` holds five more files doing exactly that job, is named in no ADR, no
convention and no gate — so the architecture test cannot say anything about it, and neither can the
door gate.

Measured: 11 files, 822 lines, 48 symbols. `contracts/` imports one thing (`test-path`); `types/`
imports nothing. Both are genuine leaves, which is why merging them is a move rather than a design.

Three of the five `types/` files are TYPE-ONLY — `domain`, `language-plugin`, `prism-types` have zero
runtime exports. The other two carry constants and helpers (`CaptureTags`, `mcpOk`/`mcpErr`), which is
what makes this a real merge rather than a rename.

**A `@/`-shaped grep said two files had no importers. Both are used**, via relative specifiers
(`../../../types/capture-tags.js`). That is the THIRD time in this campaign a `@/`-shaped search
undercounted — 8 became 12 on git, 21 became 24 on utils, and here it reported two live files as
dead. The gate resolves specifiers; a text search cannot.

Behaviour does not change (rule 16). Every file moves whole; nothing is rewritten on the way.

## Phase 0 — read before moving
- Builds: 0150
- [x] read. Every `contracts/` file states its own reason and they rhyme — `dead-code-types`, `source-extensions`, `test-path`, `verdict`, `symbol-resolution` each ENDED a duplication. The `types/` files were older type dumps with no such claim
- [x] flat at `contracts/` root — 8 files is small, and a subfolder would recreate the two-homes problem this todo exists to remove
- [x] THREE of the five. `language-plugin` (13 importers, all parsing) and `capture-tags` went to `core/parsing/`; `mcp-response` to `interfaces/tools/shared/`. Rule 5 read the other way: a type ONE feature uses belongs to that feature, and a shared folder makes it everyone's permanently

## Phase 1 — the merge
- Builds: 0150
- Depends: todo72#P0
- [x] all five moved with `git mv`
- [x] 21 files repointed for the move, 39 more for the door
- [x] gone. `git mv` leaves the directory behind; it was removed explicitly

## Phase 2 — the door
- Builds: 0150
- Depends: todo72#P1
- [x] 9 runtime symbols and 8 types. `DOORS` takes the plain path `contracts`, since this is a layer rather than a feature under `lib/`
- [x] the gate holds all three doors. Pointing 39 files at this one broke exactly one thing — `tests/unit/contracts/verdict.test.ts`, which uses internals the door does not export. It is the feature's OWN test, so rule 3 allows it, and typecheck named it at once. A door narrow enough to break the feature's own test on a blind rewrite is narrowing something real
- [x] holds — the only internal import is `test-path`, and nothing leaves the layer

## Phase 3 — clean behind it
- Builds: 0150
- Depends: todo72#P2
- [x] all 10 closed, 0 real gaps remain (12 UNIT nodes the harvester cannot reach)
- [x] none. The two files a `@/`-shaped grep called dead — `capture-tags`, `mcp-response` — are both live via relative specifiers. THIRD time that search shape has undercounted: 8→12 on git, 21→24 on utils, and two live files reported dead here
- [x] none contradicted

## Phase 4 — make it break
- Builds: 0150
- Depends: todo72#P3
- [x] `mcp-response` shapes EVERY MCP answer and had no test — 10 cases added. `verdict` and `test-path` carry pre-existing suites and were not duplicated
- [x] a falsy payload (`0`, `''`, `false`), an absent key rather than an undefined one, a transient error declaring itself retryable, and a suggestion carried through
- [x] three mutations, three failures — `truncated` defaulting to true, `retryable` defaulting to true, and `data || {}` erasing a falsy answer

## Phase 5 — close it honestly
- Builds: 0150
- Depends: todo72#P4
- [x] 1,964 tests / 258 suites, four oracles green, typecheck 0 (it caught a bad cast in the new test), docs-lint clean
- [x] recorded
- [x] 15 PASS, 1 n/a, 0 open — the FIRST feature to satisfy every applicable rule. Rule 4 passes here for the reason it fails elsewhere: a contracts layer has no instance to hand out
