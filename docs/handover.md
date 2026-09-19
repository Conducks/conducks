# Handover — 2026-09-19
Status: current

## Where it stands
Gates green: **2,536 tests / 328 suites**, build clean, `docs-lint` 239 docs, `visuals-lint` 317
anchors across 81 pages, review stamps clean (234 claims), drift clean. `conducks guard` on this repo: layer contract clean, 182
pre-existing `no_cycles` findings (measured before and after this session's change — unchanged).

**todo79 closed earlier today.** `architecture.md`, `features.md`, `conventions.md` and `memory.md`
are deleted (ADR 0193, 0194, 0195); their facts live in the module notes, which are grammar-linted.
The `CONDUCKS-N` ids are retired — ADR 0195 carries the translation table.

**ADR 0197 — a project declares its own layers.** `.conducks/sentinel.yml` now takes a `layers:`
list (`name`, `path`, comma-separated `allow`), read by `loadLayerContract`. `LAYER_FRAGMENTS` and
`ALLOWED_DEPENDENCIES` become the fallback rather than the only contract, so `conducks guard` is a
usable gate on a project that is not this one. A declared contract that does not hold together — a
duplicate name, a missing `path`, an `allow` naming an undeclared layer — checks NOTHING and reports
an error; it never falls back to conducks' own directory names, because a verdict computed from
another repository's folders is worse than no verdict.

**todo77's two deferred items are closed, and both deferral notes were wrong.**

- The ROUTE scenario the bench "could not reach" needed no framework at all: Next.js declares a
  route by file position, so `app/api/hello/route.ts` exporting `GET` is a one-file fixture.
  `bench-entry.mjs` is 12 scenarios, with the route group and the lowercase-`get` counter-half.
  Proven by mutation — `looksRoute = false`, rebuilt, confirmed in the built output, fails 11 and
  leaves 12 green.
- The two `length <= 1` cycle guards were called unreachable because "`detectCycles` returns no
  cluster for a self-loop". It does: `algorithms/cycle-detector.ts:89-96` pushes a one-node SCC when
  the node carries a self-edge. They were reachable and *redundant* — a one-node cluster spans one
  file, and the `files.size > 1` filter beside them already dropped it. Mutating `<= 1` to `< 1`
  changed no answer, which is what proved it. Both guards are deleted and `audit.test.ts` pins the
  self-import outcome against the filter that does decide.

**All 36 unstamped pages were read against the code and stamped.** `docs-lint` reports review
stamps clean — 234 reviewed claims cite unchanged code — and the stamp store
(`.conducks/note-reviews.json`) is committed, so this is the repository's state rather than this
machine's. Nine pages carried a claim that was false while every anchor in it resolved; the commit
message for that pass lists each one. `interfaces/tools` listed its capability as "none" while
offering thirteen MCP tools; its `## Features` names all thirteen now.

The per-project layer contract is proven on a real project as well as on fixtures: sofie's eight
declared layers produced nine illegal pairs and exit 1, a widened `allow` turned the same repo
clean, and a typo in an `allow` produced the NOT CHECKED error. Its config was removed afterwards.

## Next, in order
1. **`conducks features` is in better shape than the last handover claimed.** That note said 31/31
   notes had no `## Features` body; measured today, 17 carry one and 14 say `none` — each with a
   written reason (one file, a vocabulary layer, a composition root). No bare `none` remains. The
   open question is not "fill them" but whether `## Features` means SUB-NOTES (what the standard's
   §6.3 skeleton says) or CAPABILITIES (what `interfaces/cli`, `interfaces/web` and now
   `interfaces/tools` list). Both readings are in the corpus. Settle it in the standard first.
2. **Two real import cycles in `src/lib`, found while reading the notes.** `conducks audit` reports
   182 ARCH-3 clusters; 540 of the members are planted fixtures under `tests/fixtures/`, and eleven
   are real: a 9-node cluster through `core/git/index.ts → chronicle-interface.ts` joining the
   language packs to git, and a 5-node cluster between `domain/analysis` and `domain/docs`. Both are
   the door-to-door shape ADR 0150 rule 5b names. Untriaged — a fix is its own change with its own
   before/after.
3. **`src/registry/index.ts` is an ARCH-1 hub at 73 runtime importers** against a limit of 50. The
   type-only exclusion still works; the fan-in grew. Three notes carried the old 14/37 reading as
   current and now carry both.
4. **todo77 is `doing` with its remaining phases**, and `todo16 — npm publish` is `blocked` on the
   owner: the first publish claims the name permanently.
5. **`legacy/` holds 5 files** (an old handover log, `progress.md`, todo2–4). Nothing live links
   into them. Delete or keep — decide once.

## What the checks did NOT cover
Three glossary collisions remain and are correct: `anchor`, `Pulse` and `Wave` are each two
unrelated things sharing a word, qualified in place. `conducks glossary` reports them forever.

The completeness bar ADR 0193 states — from the notes alone a reader can describe the system without
opening the code — is UNSCORED by decision. Nothing checks it; ADR 0194 says why.

The two `src/lib` cycles above are reported, not triaged: nobody has established whether each is a
real runtime cycle or a door-to-door artefact of what a barrel re-exports.

A stamp says a page was read against the code on a date. It cannot say the reader understood what
they read, and `visuals-lint` re-flags a stamped claim only when the cited SPAN changes — a claim
whose code moved elsewhere goes on reading as reviewed.
