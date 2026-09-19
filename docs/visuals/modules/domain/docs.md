# domain/docs — the tooling for the two standards

**Layer:** domain. Eleven files: `docs-board.ts`, `docs-grammar.ts`, `docs-watcher.ts`,
`service-docs.ts`, `visuals-lint.ts`, `visuals-drift.ts`, and the five that arrived with ADR 0193's
computed views and the visuals build — `features.ts`, `glossary.ts`, `module-notes.ts`,
`testing-page.ts` and the door. The six named first are the originals this note was written for.

**Read at `8d4e7ff`.** This area did not exist until 2026-08-17. All six files lived under
`domain/analysis`, which held twenty-three files and four unrelated subjects.

**Responsibility:** whether the documentation obeys its own rules. What the docs tree contains,
whether each file conforms to the conducks-docs grammar, whether every `file:line` a visual claims
still resolves, and whether a generated page still matches a fresh render.

**Boundaries:** it reads the TREE, never the vault. A docs check that needed a graph would be a check
you cannot run before analyzing, which is exactly when you most want it (ADR 0058). A docs-layer tool
never touches the graph — enforced by `tests/unit/interfaces/tools/docs-layer.test.ts`, which reads as
a dependency boundary: the docs/code split (ADR 0023) means a docs tool must answer with no graph and
no DuckDB open at all.

**Uses:** nothing below it but the filesystem — this area is a leaf against the graph, which is what
lets it run before `analyze` ever does. [docs-grammar](docs/docs-grammar.md) and
[docs-board](docs/docs-board.md) are its two parts; see those notes for what each answers.

## Features

- **Docs grammar gate** (`conducks docs-lint`) — see [docs-grammar](docs/docs-grammar.md).
- **Docs board** (`conducks docs-status`, MCP `conducks_docs`) — see [docs-board](docs/docs-board.md).
- **Visual anchor gate** (`conducks visuals-lint`) — checks every anchor a diagram makes against the
  working tree: the file resolves to exactly one place, the line exists, the symbol is still defined,
  and a constant written in the page still matches the value the code assigns. An ambiguous
  abbreviation fails rather than resolving to a guess. Runs against the filesystem, never the vault —
  a graph keyed to the last pulse would let a lying page report clean (ADR 0138, ADR 0035).
- **Drift check** (`visuals-drift.ts`) — flags a generated page that no longer matches a fresh render.
  Anchors resolving and content being true are different claims; this is the second half `visuals-lint`
  does not cover.

## Glossary

- **Anchor** — a `file:line` (or symbol) claim a visual page makes, checked to still resolve.
  **Not the anchor [core/bootstrap](../core/bootstrap.md) means** — that one is the resolved project
  root. Same word, unrelated things; `conducks glossary` reports the pair on purpose.
- **Drift** (docs sense) — a generated page whose content no longer matches what a fresh render would
  produce, distinct from an anchor that fails to resolve at all.

## Why it is a feature, and the measurement that decided it

`analysis` was 23 files. Grouping them by subject and counting imports BETWEEN the groups gave five
cross-group edges in total — and these six files import nothing else in that folder. Only two files
imported back, both taking `buildBoard`.

A folder holding four unrelated subjects is not a feature; it is a place things were put. The
decision was made from that count rather than from how the names read.

## `visuals-lint` is here, not in `domain/visual`

They share a word and nothing else. This lints the `docs/visuals/` PAGES — anchors, provenance,
drift against a fresh render. `domain/visual` is the graph's own visual wave, answered from SQL.

Pairing them by the word is how the old folder got the way it was.

## What no gate here can catch

`visuals-lint` proves an anchor RESOLVES — that the file exists and the line is real. It cannot prove
the sentence attached to it is still TRUE. That failure has already happened in this repository: a
module note described a resolver that had been deleted three commits earlier, and every anchor in it
resolved perfectly.

The drift check closes the other half — a generated page that no longer matches its source — and the
two together are the most that can be automated. The rest is the read log.

## A gate that cries wolf is a gate people scroll past

`definesSymbol` allowed exactly ONE modifier before a method name, so `public async foo()` and
`public static foo()` — the two commonest forms in this codebase — did not match. The first generated
canvas produced twelve warnings and all twelve were false.

That was fixed before anything else was believed, because a checker whose warnings are usually wrong
teaches everyone to ignore the one that is not.
