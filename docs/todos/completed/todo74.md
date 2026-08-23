# todo74 — Every visual gets a source, and the terminal becomes a second target
Status: done
- Acceptance: every page in docs/visuals/ is rendered from an authored source, and one repository owns the grammar and both readers of it.

## Context

ADR 0154 decided it: a visual's source is authored text and the page is output.
Three pages here are still hand-written HTML that is its own source, and a
fourth source — ForgeTerm's testing tasks — exists twice, once in a JavaScript
array and once compiled into a Rust plugin.

**The order across repositories cannot be a `- Depends:` field**, because that
field is per tree and refuses even a cross-tree address. So it is written here
and in ForgeTerm's todo19: this repository renders the authored source BEFORE
ForgeTerm's page stops carrying its inline array, and ForgeTerm deletes its copy
of the plugin only once the copy here draws the same list. Neither repository can
enforce that on the other; both records say it.

Phase 1 is the parser and one source, and it is the phase everything else rests
on. Phases 2 and 3 are independent of each other.

## Phase 1 — the parser, and the first source

- Builds: 0154
- [x] A parser for the authored source, in this repository, with a fixture that both readers are tested against. `scripts/visuals/testing.mjs`, fixture at `tests/unit/scripts/fixtures/visuals-testing/`. The obvious home, `tests/fixtures/`, is wholly gitignored here — a fixture placed there would never be committed and "one owner, checkable" would have been a claim rather than a fact.
- [x] `testing.md` — 54 features and 405 tasks, extracted mechanically rather than retyped. Verified by the orchestrator: every id the page derives is present, none missing and none invented. Two documented grammar deviations, both at the top of `testing.mjs`: an id is embedded in the task line because `- [ ]` carries no per-task address, and the em-dash clause is reused for what a pass looks like rather than the deferred reason it is defined for.
- [x] The ids survive editing. `conducks-visuals` §0 rule 3 is explicit: append tasks, never renumber, or a tester's saved progress moves to a different question. Proved by a test that renumbering is detected, not by a comment asking people not to.
- [x] The renderer produces the page from that source, and the page declares itself DERIVED and names `testing.md` (ADR 0011). It uses only existing `system.css` classes — no private `<style>` block and no edit to a byte-shared file. `visuals-lint`'s drift gate now covers it: 77 files match a fresh render.

## Phase 2 — the pages that are still their own source

- Depends: todo74#P1
- Builds: 0154
- [x] `problems.md` and `holding.md` replace the hand-written pages, rendered by `scripts/visuals/pages.mjs`. A separate renderer rather than the notes one: `notes.mjs` is byte-shared with other repos and may not be edited locally.
- [x] `index.md` replaces the hand-written `index.html`, and gained the link to the testing page that never existed — the page could not link to itself and no earlier owner held both files.
- [x] All three carry the `DERIVED` line and are inside the drift gate: 80 files now match a fresh render, up from 77. The old invisible `<!-- Provenance -->` comment became a visible read log in the same move — it was a claim only someone reading the source could see.
- [x] Nothing was lost, and it was checked rather than eyeballed: the orchestrator stripped the markup from each committed original and from each render and diffed the visible words. Across all three pages, ZERO words lost; every added word belongs to the DERIVED banner or the new testing link.

## Phase 3 — the terminal reader

- Depends: todo74#P1
- Builds: 0154
- [x] The checklist plugin lives here, beside the parser and the renderer it shares a grammar with. `plugins/checklist/`, building for `wasm32-wasip2`, 11 tests passing.
- [x] It reads the real source rather than a compiled-in slice, through `load("docs/visuals/testing.md")` — the same path the JS renderer reads. Both readers verified by the orchestrator to agree on the real file: 8 sections, 54 features, 405 tasks. Truncating task text in the Rust parser fails two tests, so the agreement covers text and not merely counts.
- [x] **It drew NOTHING when ForgeTerm ran, and the cause was a mistake in ADR 0154 rather than in the plugin.** `load` resolves against the project the WINDOW is in; the source was in the wrong repository. Fixed by ADR 0155: the source moved to the repository it describes, and the parser, renderer and plugin stayed here.
- [x] ADR 0155 amends 0154, stamped on both ends. forgeterm now carries `package.json`, `conducks.json`, a verbatim `testing.mjs` and its own `visuals.config.mjs`, and has a drift gate for the first time — 4 files match a fresh render.
- [x] The naming rule lives here, which is what ForgeTerm's ADR 0033 said from the start: the host judges a path and never learns the grammar behind it.
- [x] The ticks are keyed to the build and are never committed — carried over from ForgeTerm's todo19#P1, with `/plugins/checklist/target/` and `docs/checklist-run.json` gitignored here too.
- [x] `wit/plugin.wit` is a VENDORED COPY of ForgeTerm's, and now half-gated rather than ungated. `wit/plugin.wit.sha256` records the bytes it was built against and a test verifies it, so a local edit to the copy fails rather than compiling into a silent fork. Proved with a COMMENT-ONLY edit, deliberately: a semantic change could have failed the build instead, which would have proved the build works rather than that the check does.
- [x] What that check cannot see is written in `plugins/checklist/wit/VENDORED.md`: ForgeTerm changing the contract. This repository does not know where that one is, and a hard-coded path breaks on every machine but one. That asymmetry is the stated debt, and it is the half that matters most.
- [x] The shared renderer tolerates a repository with no testing source: it says so and exits 0. Without it, `npm run visuals` breaks in every repo that has the file and no page — which is most of them.
- [x] The large document is now a committed fixture both readers assert against, replacing the `include_str!` of a live file that stopped compiling when the source moved. Stronger than what it replaced: the two readers previously never agreed on a large document at all.

## Phase 4 — the standard says what it now is

- Depends: todo74#P1
- [x] `conducks-visuals` describes `testing.html` as a page. Rewritten: rule 5 now says the data is a FILE rather than an array inside the page, and a new rule 5b states that a testing page is a source with renderings, with a table of what a non-browser target may and may not assume.
- [x] The tree now reads `source → page` and says the right-hand side is output. A table gives the format per source and states the rule that decides it: who READS the source, not how the content is shaped. The bootstrap allowance is narrowed in the same turn — hand-writing a page a PERSON reads is fine, hand-writing one a PROGRAM reads is not.
- [x] Three rows added to the not-gated table: a source and its page disagreeing (covered by drift), two renderers disagreeing about the grammar (covered ONLY by the shared fixture, and nothing enforces that both use it), and a non-browser target rendering the source unusably (covered by nobody — the fixture proves parsing agreement, never that either draws something a person can act on).
