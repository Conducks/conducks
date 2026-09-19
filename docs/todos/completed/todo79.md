# todo79 — dissolve four docs files into the module notes

Status: done

- Acceptance: `docs/` root holds only `decisions/`, `todos/`, `handover.md` and `visuals/`; the combined `conducks docs-lint` (note grammar plus `visuals-lint`) and `npm run visuals` both pass, no `CONDUCKS-[0-9]` citation resolves to nothing, and `conducks glossary` and `conducks features` reproduce every cross-module fact the four deleted files held.

## Context

ADR 0193 decides that `architecture.md`, `features.md`, `conventions.md` and `memory.md` are deleted and their contents move into the per-feature notes under `docs/visuals/modules/`, into gates, or into two computed views. This todo is that work.

The order matters and is not negotiable: the standard is rewritten before the tooling follows it, the tooling exists before the migration is verified against it, and nothing is deleted until the migration has a home for every fact. Phase 0 answers what cannot be answered from the decision alone.

A fourth fact, measured on 2026-09-18 and the one that nearly cost this todo its first phase: **the skills are not edited where they are read.** `src/resources/skills/conducks-docs.md` is the SOURCE; `~/.claude/skills/conducks-docs/SKILL.md` is an installed copy that `scripts/sync-skills-postbuild.mjs` overwrites from it on every `npm run build`. The two are byte-identical apart from the header — the source carries `<!-- description: ... -->` and the installer rewrites it as YAML frontmatter. An edit made in `~/.claude` is discarded by the next build, silently, and the skill then serves guidance from the previous generation. Phases 1 and 2 edit the repo source, never the installed copy.

Three more facts to carry into any session picking this up. The canvas at `docs/visuals/architecture.html` and the rendered `docs/visuals/modules/*.html` are NOT touched — the `.md` is the authored source and the `.html` beside it is derived (ADR 0140). A note's path is the feature's path with container segments elided, so `core` and `lib` never get one. And the notes are authored, never generated: what stops them rotting is the anchor gate, not a parser.

## Phase 0 — answered by ADR 0194

- Builds: 0194
- [x] The `CONDUCKS-N` IDs are retired: every citation is rewritten to name the gate or the note that holds the rule. Measured 2026-09-18 at `4c9334e`: 256 citations across 131 files against 49 definitions, no dangling IDs — 91 in `src/` and `tests/`, 13 in `legacy`/`archive`/`deep_clean.md`, 5 in `scripts/` and `tools/`, 10 under `docs/visuals/`. Keeping the IDs with definitions moved into the notes was the smaller diff and was rejected: an address no file defines resolves by luck, and `docs-lint` cannot check it the way it checks `todoNN#PN`
- [x] A module note IS grammar-linted, and `docs-lint` becomes the single gate over every authored doc — it runs the note grammar and invokes `visuals-lint`. Required: the title, `**Layer:**` `**Responsibility:**` `**Boundaries:**` `**Uses:**`, `## Features` and `## Glossary` present even when the body says none, and `Status: deprecated` on a tombstone. `## Traps` stays optional so no feature is pushed into inventing one
- [x] Nothing checks the completeness bar, and that is written down rather than implied. It stays stated in `conducks-docs` §8, and the working check is a session reading the notes against the code it is about to touch and fixing what it finds wrong in the same change. An LLM-judged eval was rejected as a non-deterministic gate in a repo whose argument is that a gate must be deterministic; the bar is reported as an UNSCORED claim beside the counts the gate does check — ADR 0124

## Phase 1 — rewrite `conducks-docs`

- Builds: 0193, 0194
- Depends: todo79#P0
- [x] Every edit in this phase lands in `src/resources/skills/conducks-docs.md`, the source. An edit to `~/.claude/skills/conducks-docs/SKILL.md` is overwritten by the next build — see `## Context`
- [x] §2's where-a-fact-goes table routes to four files that will not exist. Rewrite it to route to the note, the gate, or the computed view
- [x] §3.1 and §3.2 draw both trees with the four files in them, and the root-vs-service table gives three of them a root-only column. Remove them and promote `visuals/modules/` into the core set
- [x] §3.3 lists three of the four under "create now". A new tree should bootstrap `decisions/`, `todos/`, `handover.md` and `visuals/modules/` and nothing else
- [x] §5.4 names six linted types and says module notes are parsed but never grammar-checked. Per ADR 0194 the set becomes FOUR — `todos`, `decisions`, `handover` and the notes — `docs-lint` is stated as the single gate that also runs `visuals-lint`, and the root-only failure rules lose two of their three subjects
- [x] §5.4's note grammar is written out where the other five live: the required title, the four `**...:**` fields, `## Features` and `## Glossary` present even when empty, `Status: deprecated` on a tombstone, `## Traps` optional. State plainly that it checks a question was answered, never how well
- [x] Delete §6.1, §6.2, §6.4 and §6.5. §6.2's replacement is one line: shape is the canvas, the contract is the code that encodes it plus its test
- [x] Rewrite §6.3 to the note shape ADR 0193 fixes — fields plus `**Uses:**`, `## Features` (replacing `## Sub-modules`), `## Traps`, `## Glossary`
- [x] §6.3 claims a note's path mirrors the source tree, "a path translation, not a search". It is false in this repo: `src/lib/core/graph` is `modules/core/graph.md` and `core` has no note. Replace with the feature-path rule and point at `conducks-visuals` §2 as what decides a feature
- [x] §6.3 gains the tombstone rule: a removed feature's note is marked deprecated and stays linked and greppable, never moved to `legacy/`. Without it the removed-module warning that justified `memory.md` has nowhere to live
- [x] §6.13 says a visual is never the source of truth. That stays true of renders and is now misleading about the `.md`, which carries binding rules. Reword so the source-versus-render split is unmissable
- [x] §7's read-once budget names conventions, memory and handover. Two are gone; state what a session loads instead
- [x] §8 rule 4 says architecture is authored, which stops being a rule when the file stops existing. The `legacy/`-is-last-stop rule inverts for tombstoned notes. Add the completeness bar from ADR 0193
- [x] The nav table near the top still routes "write features, architecture, a module note, conventions or memory" at §6.1–§6.5. The sections now explain what replaced each subject, so the address resolves, but the verb is wrong — those four are no longer writable files
- [x] The `description:` header and the "Owns:" line still describe the six-file model, naming features, an architecture graph, conventions and memory. The description is what a session matches the skill on, so a stale one mis-routes work before the file is even opened — the description was stale and is rewritten; the "Owns:" line was checked and named no dead file, so it needed nothing
- [x] `src/resources/skills/conducks-docs.md` is the source and `~/.claude/skills/conducks-docs/SKILL.md` is the installed copy. After editing the source, prove the sync carries it: build, then diff the two bodies

One more thing the sync-proof turned up: `npm run build` printed `[postbuild] skills (global) → ...: 4 current` in the same run that rewrote the installed copy. The report says nothing changed while something did, so it cannot be used as evidence either way — the sync was confirmed by diffing the two bodies instead. ADR 0124's shape, in the tooling this todo is about to extend.

Measured on 2026-09-18, and the reason this phase cost more than its tasks said. The twelve content items were straightforward. What was not: the skill is edited in one place and read from another, and the first pass was written into the installed copy. A build ran at 22:44:43 while that edit was in flight, `scripts/sync-skills-postbuild.mjs` overwrote the installed copy from the source, and roughly ten items of work were reverted with nothing to show it had happened — no git trace, because the installed copy is not in this repo. The work was reapplied from the agent's own written log and then ported to the source by hand. Two things follow. A build is not a read-only act while a skill is being edited. And the installed copy has no undo: the log the agent kept as it went was the only reason the first pass was recoverable.

## Phase 2 — rewrite `conducks-visuals` and its references

- Builds: 0193
- Depends: todo79#P1
- [x] Same source rule as Phase 1: edit `src/resources/skills/conducks-visuals.md` and `src/resources/skills/conducks-visuals/`, never the installed copy under `~/.claude`
- [x] §2 describes a feature page as `modules/<feature>.html` without saying the `.md` beside it is its only authored source. State it, and state that a note may exist with no canvas box — `core/utils.md` exists today and a util earns no box
- [x] §2 says a directory is not a feature while `conducks-docs` §6.3 says notes mirror directories. Once §6.3 is fixed, §2 becomes the single owner of what a feature is and must say so
- [x] `references/pages.md` describes notes as intent only. They now carry features, traps, glossary and boundary rules
- [x] `references/anchoring.md` treats an anchor as guarding a description. An anchor now guards a binding rule, which raises what a broken one costs — say so where the stamp rules are stated
- [x] `references/features.md` owns how a feature boundary is found. It now also decides note paths; add that consequence
- [x] `references/pages.md:98` named a note after "the source tree, mirrored" — the same false claim Phase 1 removed from `conducks-docs` §6.3, surviving on the other side of the pair. Replaced with the feature-path rule and a worked example

Found while reviewing Phase 2 rather than listed in it, and worth saying why it was missed twice. The two skills state the same rule from two directions, so correcting one side reads as finishing the job. The rule now lives in `conducks-visuals` §2 alone and `conducks-docs` §6.3 points at it — a second copy anywhere is the thing to delete, not to fix.

## Phase 3 — the two computed views

- Builds: 0193
- Depends: todo79#P1
- [x] Build `conducks glossary`: walk every note's `## Glossary`, group by term, report a term defined in two or more features as a collision. A collision is derived, never written down, so it cannot go stale
- [x] The tool only sees terms somebody typed. Print the count of notes carrying no `## Glossary` beside the result, or a clean run reads as "no collisions" when it means "nobody wrote any" — ADR 0124
- [x] Normalise terms before grouping — case and simple phrase folding. `node` and `Node` failing to collide is the exact case the tool exists for
- [x] Build `conducks features`: walk every note's `## Features` and print the tree, with the same count of notes carrying no section
- [x] Mutation-test both: break the grouping and the honesty count separately and confirm a test fails for each. A tool that reports "0 collisions" whether or not it works is the failure these two exist to prevent

Measured against the 28 real notes on 2026-09-18, after wiring: `conducks glossary` reports "no collisions across 28 note(s)" and, on the next line, "28/28 note(s) carry no `## Glossary` section at all — not checked, not clean." `conducks features` reports the same 28/28 for its own section. That pair IS the phase's proof: the first line alone would read as a clean bill of health for a corpus where nobody has written a single glossary entry yet.

Both mutations were re-run by the orchestrator rather than taken on report. Grouping threshold 2 → 99 failed 2 tests; the honesty counter disabled failed 1. The file was restored from a byte copy and re-verified identical after each. The registry wiring is the orchestrator's: `glossary` and `features` were added to `STALENESS_BYPASS` and `NEEDS_NO_REGISTRY` together, the subset invariant those two sets carry being asserted by `tests/unit/interfaces/cli/no-registry-commands.test.ts`.


## Phase 4 — the code that scaffolds and lints

- Builds: 0193, 0194
- Depends: todo79#P3
- [x] `manifest-engine.ts:60` writes an `architectureSkeleton` and `:65` writes a handover pointing at `features.md` and `architecture.md`. Drop the skeleton, drop the four files from the bootstrap set, rewrite the handover text. NOT seeding `visuals/modules/` — this task originally said to, and it was written before Phase 1 rewrote `conducks-docs` §3.3, which puts a note under create-when-first-needed and `visuals/` under only-when-someone-asks (§6.13). Seeding it would have contradicted the standard this todo just wrote
- [x] `bootstrap-docs.ts:9-11` documents the old file set in its own header comment, including the sentence that `architecture.md` is a skeleton a person fills. Rewrite comment and scaffold together
- [x] `visuals-lint.ts:59` scans a list naming `architecture.md`, `memory.md` and `conventions.md`. Remove the three; everything under `visuals/` is untouched
- [x] The docs grammar parser carries `Status:` vocabularies and root-only checks for conventions and memory. Remove them
- [x] Add the module-note grammar to the parser as the fourth linted type, per ADR 0194. A note missing a required field or section fails; `## Traps` does not
- [x] `docs-lint` invokes `visuals-lint` so one command is the whole docs gate. `visuals-lint` stays callable alone for `--stamp`, which is per-page and not a gate. Update every caller — gate scripts, `conducks.json`, CI — to the combined command
- [x] Break the note grammar deliberately — drop a `**Uses:**`, drop a `## Glossary`, mis-spell a field — and confirm the combined gate fails on each. A grammar that passes a malformed note is the failure this phase exists to prevent
- [x] `conducks_docs` over MCP returns the four files. It should return the notes plus the two computed views
- [x] `docs-status` counts the dead files into its board. Remove them
- [x] `record.ts` still accepts `--type conventions` and `--type memory` and writes to those files. Phase 4 never touched it and Phase 5 found it: the command will happily recreate a file this todo deletes. Found by `tests/integration/features/record-command.test.ts`, which still exercises both types and still passes

The note grammar is LIVE and gating from this change, with no flag and no soft-warn stage. The consequence is immediate and was measured, not predicted: `conducks docs-lint` now exits 1, because all 28 existing notes are missing `**Uses:**`, `## Features` and `## Glossary` — the sections Phase 6 adds. `scripts/hooks/pre-commit:37` aborts a commit when `docs-lint` fails, so this repository cannot be committed to until Phase 6 migrates the notes.

A bypass flag was considered and rejected by the agent that built it, on the grounds that a flag lets Phase 6 be skipped silently. That is the right instinct and it is the reason this todo's acceptance is the gate passing AFTER the migration, not before.

One trap found the hard way, and it is not about this phase: `tests/integration/features/helpers.ts::ensureBuild` runs `npm run build` on its own whenever it sees source newer than `build/`. So a targeted run of any integration test that imports it is a build, whatever the runner was asked to do. It fired mid-phase, failed partway, and left a partial `build/` holding only `package.json`, `sentinel.json` and half a `src/` tree. Nothing downstream of a partial build can be believed — the orchestrator deleted `build/` and rebuilt from clean before measuring anything.


## Phase 5 — the tests that assert the old shape

- Builds: 0193
- Depends: todo79#P4
- [x] `tests/unit/domain/manifest/bootstrap-docs.test.ts` asserts the bootstrapped file set and will fail on the new one
- [x] `tests/unit/domain/docs/docs-grammar.test.ts` asserts the conventions and memory rules that no longer exist. It gains the note-grammar cases in the same pass
- [x] `tests/unit/domain/governance/layer-contract.test.ts` cites `CONDUCKS-N` in its own comments. It is source, so its citations are rewritten, not stamped
- [x] `tests/unit/domain/docs/visuals-lint.test.ts` asserts the scanned-file list
- [x] `tests/integration/features/lifecycle-truth.test.ts` references `architecture.md`
- [x] Every new test must fail against a deliberately broken version of what it covers. A migration test that passes on an unmigrated tree proves nothing

The hypothesis held, and the phase returned more than it was asked for. Two test files were found by grepping rather than from the handover list — `tests/integration/features/docs-commands.test.ts` and `tests/unit/interfaces/cli/commands/docs-status.test.ts`, the latter crashing with a `TypeError` because `DocsLintCommand` now calls `registry.visuals.lint()` unconditionally and its fake registry had no `visuals` key. A handover list is a hypothesis about what broke, and the grep is what makes it a finding.

One genuine regression, introduced by Phase 4 and caught here: `computeBootstrap` took `projectName` and no longer used it, because the two files that interpolated it — `features.md` and `architecture.md` — were dissolved and nothing replaced them. Every bootstrapped project's docs were byte-identical regardless of name. The test that caught it was left FAILING rather than weakened, which is the only reason it was fixed rather than absorbed. The name now lands in `handover.md`'s prose, where §6.11 leaves room for it without touching the dated title.

Two tests under `tests/integration/features/` were edited STATICALLY and never run — `lifecycle-truth.test.ts` and `docs-commands.test.ts` both import `helpers.ts`, whose `ensureBuild()` fires a real build on its own. They are reasoned from the same `manifest-engine.ts` logic the passing unit tests confirm, and they remain UNVERIFIED BY RUN until the orchestrator's gate covers them. Said here rather than left to look green.


## Phase 6 — migrate this repository's own docs

- Builds: 0193
- Depends: todo79#P3
- [x] `memory.md` is 2714 lines. Route each entry: module-shaped to that feature's `## Traps`, a word to its `## Glossary`, cross-module with no owner to the glossary of the feature that defines the term. An entry an agent cannot place is FLAGGED, never deleted — the decision was made on 2026-09-18 that a human settles each one before Phase 7. Four are outstanding, in the three `agent-*-orphans.md` files
- [x] `conventions.md`: each of the 49 `CONDUCKS-N` rules becomes a gate, moves to a note's `**Boundaries:**`, or is dropped with a reason. Record the destination of every one before any citation is rewritten — the map is what the rewrite reads. Final map: GATE 16, NOTE 22, SKILL 9, DROP 1, UNSETTLED 1 (CONDUCKS-39, since routed to the global CLAUDE.md §4 that already stated it)
- [x] The 22 NOTE-destined rules are applied; the 9 SKILL-destined ones are NOT. They belong in `conducks-docs` or `conducks-visuals`, and Phases 1 and 2 closed before the map that names them existed. Apply them, or the rules die with `conventions.md` having reached no home at all
- [x] Rewrite every live `CONDUCKS-[0-9]` citation to name the gate or the note that now holds the rule, per ADR 0194. This reaches outside `docs/`: `persistence.ts`, `impact.ts`, `query.ts`, `chronicle-interface.ts` and `layer-contract.test.ts` each cite an ID in a comment, so the typecheck and the full suite are part of this phase's proof
- [x] Frozen records — ADRs and `completed/` todos — are NOT stamped after all, and are left untouched. ADR 0195 amends 0194 on this: 69 citations across 43 frozen records would have meant 43 edits to answer one repeated question, so the answer lives once in 0195's own table instead. `docs/deep_clean.md` is treated the same way — it is a historical log whose entries describe what a rule did AT THE TIME (`CONDUCKS-1 ... PASSED, because no single FILE closed a loop`), and rewriting those would falsify the log
- [x] Four module notes and six of their `.html` renders already cite a `CONDUCKS-N`. A note citing a rule that lands in that same note has its citation DELETED, not rewritten; the six renders are derived (ADR 0140) and are regenerated, never edited by the rewrite pass
- [x] Fixed when `grep -rEo 'CONDUCKS-[0-9]+' --exclude-dir=node_modules --exclude-dir=build --exclude-dir=.conducks .` returns ONLY: the frozen records under `docs/decisions/` and `docs/todos/`, ADR 0195's own translation table, `docs/deep_clean.md` and `docs/legacy/`. **256 across 131 files at the start, 89 at the end** — 42 in `decisions/`, 31 in `todos/`, 8 in `legacy/`, 5 in `deep_clean.md`, and 3 in the gate's own prose, which names the pattern it forbids and is exempted from itself in the file, out loud
- [x] `features.md` is 329 lines. Capability intent goes to the owning note's `## Features`. The `## Tunables` table dies — a default is a value in the code and restating it is what this record exists to stop
- [x] `architecture.md` is 89 lines. The mermaid is a duplicate of a canvas that already exists and is gated, so it is deleted rather than ported. The contract prose goes to the `domain/governance` note
- [x] The 28 existing notes gain `**Uses:**`, `## Features` and `## Glossary` — the shape ADR 0194 now lints. `**Uses:**` is the new one and the one the completeness bar rests on: what this feature takes from below and what it does with it. A note with nothing to say in a section says so in its body; the section is never absent
- [x] ADRs citing the four files are frozen records. Stamp, never edit — and in the end they are not stamped either. ADR 0195 amends 0194 on exactly this: 43 frozen records would each have carried a stamp answering the same question, so the answer lives once in 0195's table and the records are left saying what they said. `docs/deep_clean.md` is treated the same way for the same reason

## Phase 7 — delete, and prove nothing was lost

- [x] The coverage audit measured what the migration actually covered, and it is not what the three note agents implied. Of `memory.md`'s 219 entries: 154 MIGRATED, 8 COVERED-ELSEWHERE, 1 STALE, and **56 MISSING** — a quarter of the file had no home. State beside that number what it does NOT cover: 121 of the 154 MIGRATED verdicts rest on a two-token grep match, and only 20 were read line by line (0 false positives in that sample)
- [x] Route the ~20 MISSING entries that are METHOD lessons, not facts about this code — "a contaminated measurement looks like a finding", "the instrument must be probed before its reading is believed", "I called a flake fixed on a sample too small, twice". They go to the global `CLAUDE.md` §4 and the `test-master` skill, the same call made for the retired CONDUCKS-39. A lesson about measurement filed under a persistence note is a lesson nobody finds
- [x] Route the ~35 MISSING entries that ARE facts about this code, creating the notes they need. `bench.md` has a rendered `.html` and no `.md` source at all, which is why the benchmark-tooling traps are homeless
- [x] `features.md`: `conducks diff`, `conducks link` and `conducks record` appear in NO module note. Their capability intent has nowhere to land today
- [x] `architecture.md`'s node table is stale — `domain/kinetic` and `core/utils` both have real notes and neither is listed. The table dies with the file, but check nothing else was reading it first
- Builds: 0193
- Depends: todo79#P5, todo79#P6
- [x] Delete the four files only once every fact in them has a stated destination. A fact with no home is a decision to drop it and is written down as one

The coverage was MEASURED twice, and the second pass is the only reason this is safe. First audit of `memory.md`'s 219 entries: 154 MIGRATED, 8 COVERED-ELSEWHERE, 1 STALE, **56 MISSING**. Four agents and the orchestrator then housed all 56 — 35-odd as facts in the notes that own the code, and the rest as method lessons in the global `CLAUDE.md` §4 and the `test-master` skill, because a lesson about measurement filed under a persistence note is a lesson nobody finds. Re-measured after: 0 unhoused.

`features.md` was checked capability by capability rather than sampled: 64 headings, 60 already named in a note, `Tunables` deliberately dropped by ADR 0193, `Deferred Graph Load` and `Diagnostics` found in `core/bootstrap.md`/`core/utils.md` under their real symbols, and **`supply-chain` genuinely missing** — a shipped command no note mentioned. Housed.

What the check did NOT cover, stated beside the number it produced: 121 of the first audit's 154 MIGRATED verdicts rest on a two-distinct-token grep match and were never read line by line (20 were, 0 false positives in that sample). The second pass used the same matcher, so it inherits that limit. Six entries it scored as unmatched were false negatives from the orchestrator paraphrasing them into the global files; each was confirmed present by direct grep instead.

Three entries were found to be FALSE rather than merely homeless, and were refused rather than migrated: the test-isolation entry blaming a DuckDB lock for `maxWorkers: 1` (the config now says 2, and its own comment records that the recorded reason "was wrong for years"), a grammars-load-from-WASM claim ADR 0027 had already removed, and a `rename`-resolver entry for a tool ADR 0156 deleted. A fourth was caught inside a note rather than in `memory.md`: `core/graph.md` cited `save({ metadataOnly: true })`, a flag `persistence.ts:881` records as having been removed because the body never read it — copied out of `memory.md` during the migration without being checked, which is the exact failure this todo exists to end.
- [x] The combined `conducks docs-lint` and `npm run visuals` both green, plus the full suite and typecheck
- [x] Record, in the closing prose and in whatever the gate prints, that the completeness bar is UNSCORED — nothing checks it, by the decision in ADR 0194. A green that reads as "complete" when it means "well-formed" is ADR 0124's failure
- [x] Write the gate that proves the id scheme stayed retired: no live file cites a `CONDUCKS-[0-9]+` except the frozen records and ADR 0195's own table. Break it by adding a citation to a live file and confirm it fails. Then stamp ADR 0195 with `- Enforced by:` — until that test exists the record honestly reports as unbuilt
- [x] Promote on close: the rules this work proved into their gates, the traps into the notes that own them, and this todo moved to `completed/`

What the hypothesis cost, since it held but not the way the phases said. Phase 6 assumed 28 notes would absorb four files. They did not: a coverage audit of `memory.md`'s 219 entries found **56 with no home** after three agents had each reported their share done, and closing that gap took four more agents, two new notes (`interfaces/web.md`, `bench.md`), and five method lessons routed out of the repository entirely into the global `CLAUDE.md` §4 and the `test-master` skill — because a lesson about measurement filed under a persistence note is a lesson nobody finds.

The migration also produced a defect of its own, which is the part worth remembering: `core/graph.md` was written citing `save({ metadataOnly: true })`, a flag `persistence.ts:881` records as removed BECAUSE its body never read it. It was copied out of `memory.md` without being checked — the same failure the whole record exists to end, committed while ending it. Three `memory.md` entries were likewise found FALSE rather than merely homeless and refused: a test-isolation entry blaming a DuckDB lock for `maxWorkers: 1` when the config says 2 and its own comment says the recorded reason "was wrong for years"; a grammars-load-from-WASM claim ADR 0027 had already removed; and a `rename`-resolver entry for a tool ADR 0156 deleted.

Seven `CONDUCKS-N` citations in `src/` and `tests/` were pointing at the wrong rule before this started — `traversal.ts` cited the weighted-Dijkstra rule for A* code, `persistence.ts` cited it for PageRank. Nobody had noticed for as long as those comments existed, and nothing could have: an id whose definition lives in an ungated file resolves by luck. That is the argument for this whole record, made by accident while carrying it out.
