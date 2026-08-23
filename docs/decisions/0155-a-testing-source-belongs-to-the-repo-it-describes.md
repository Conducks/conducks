# 0155 — A testing source belongs to the repository it describes
Status: Accepted
- Enforced by: tests/unit/scripts/visuals-testing-parser.test.ts
- Date: 2026-08-23
- Amends: 0154
- Builds: 0154

## Context

ADR 0154 said a visual's source is authored text and this repository owns the
grammar and every reader of it. Both halves are right. It then did something the
second half does not require: it put ForgeTerm's testing SOURCE here, beside the
parser.

That was discovered at integration and not before. The plugin asks the host for
`docs/visuals/testing.md`, and the host resolves a path against the project the
WINDOW is working in. ForgeTerm runs in the forgeterm repository. The source was
here. So the plugin asked for a file that did not exist in the project it was
running in and drew an empty list — the exact symptom the whole effort began
from, reached from the opposite direction.

Nothing was wrong with the plugin, the parser or the host rules. The source was
in the wrong repository.

## Decision

**The parser, the renderers and the plugin live here. The task list lives in the
repository it describes.**

A testing source is a record about one project: what a human must try in THAT
window, against THAT binary. It is not a fact about conducks, and conducks does
not become its owner by owning the grammar it is written in. The same split
already governs module notes — the standard owns the shape, each repository owns
its notes.

**Rejected: keep the source here and have the plugin reach across repositories.**
It cannot. `save`/`load` resolve inside one project by construction (ForgeTerm
ADR 0033/0034), and widening that to reach a second project would undo the
refusal those records exist to make.

**Rejected: copy the source into both.** That is the duplication ADR 0154 was
written to end.

**A shared renderer must tolerate a repository with no source.** `testing.mjs`
ships to every repository built to this standard and most have no testing page.
It now reports that and exits cleanly rather than throwing, because a shared file
that fails wherever the optional page is absent is a shared file nobody keeps.

**The large fixture replaces the live file as the agreement point.** The Rust
reader used to `include_str!` the real source, which stopped compiling the moment
the source moved. It now reads a frozen 622-line snapshot committed as a fixture,
and the JavaScript reader asserts the same counts against the same bytes. This is
stronger than what it replaced: before, one reader checked a large document and
the other checked small ones, so the two never agreed on scale.

## Consequences

**ForgeTerm gains a generator, and that is the standard working rather than
failing.** Its testing page had been hand-written with its tasks inline, which
`conducks-visuals` permits only while a person is the only reader. A plugin is a
second reader, so the allowance ended — the narrowing written into that standard
in the same round of work. It now carries `package.json`, `conducks.json`, a
copied-verbatim `testing.mjs` and a two-line `visuals.config.mjs`, and it has a
drift gate for the first time.

**A capability regression was caught by diffing, not by testing.** Rendering the
page from its source dropped the File System Access autosave, the IndexedDB
handle and the load-from-file control — several commits of real work — because
the shared renderer had never had them. Every gate was green: the page rendered,
the drift check passed, the parser tests passed. Only comparing the old page's
controls against the new one's found it. The behaviour was ported into the shared
renderer, in both repositories, in one change.

Open: **the page keys its ticks to a hash of the source's bytes, not to the
binary under test.** `conducks-visuals` §6 wants the build, and the source hash
under-invalidates in the direction that matters — a new binary with unchanged
tasks keeps its ticks, which is what §6 refuses. The reason it is not simply
fixed is a second rule pulling the other way: baking repository state into a
generated page makes the drift gate fire on every commit, which is how a gate
becomes one people ignore. Resolving it needs a build identity the page can carry
without changing on unrelated commits. No todo carries this yet.
