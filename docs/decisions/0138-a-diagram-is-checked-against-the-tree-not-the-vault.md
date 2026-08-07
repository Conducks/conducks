# 0138 — a diagram is checked against the working tree, not the vault
Status: Accepted
- Builds: 0001, 0011, 0035
- Date: 2026-08-05
- Enforced by: tests/unit/domain/analysis/visuals-lint.test.ts (every failure mode below is a case; the ambiguity refusal and the constant check are the two that carry the decision)
- Amended by: 0141, 0142 — the freshness half this record hands to todo45 shipped as review stamps: a hash of the exact cited span, per page, with the stamp's meaning protected (per-page stamping, committed store, resolved-span keys)

## Context

The conducks-docs standard governs six file types and names the hole it leaves in its own words
(§5.4): `visuals/` is "parsed but NOT grammar-checked", and "nothing catches a `visuals/` file going
stale but a reader".

That gap is not cosmetic. A diagram is a claim about code at a moment. Every `file:line` in it is a
promise that decays silently — the reader has no way to tell a true anchor from one that pointed
somewhere real six commits ago, and the more precise the drawing looks, the more it is trusted.

Measured on a real consumer (`sofie`, `docs/visuals/`, 4 pages): **146 anchors, of which 121 were
`file:line`, 25 bare, and only 5 `file::symbol`.** Of 43 distinct files cited, **16 did not resolve
from the repository root** — not because the files were gone, but because they were written
abbreviated (`daemon.py:131`, `dispatch.ts:405`). A human reads those fine. Nothing can check them.

That reframes the problem. The dominant rot is not line drift. It is anchors that were never
checkable in the first place, and `dispatch.ts` in that same repo resolves to **two** different files
— `services/voice/dispatch.ts` (the speech queue) and `systems/dispatch.ts` (the handover loop) —
so a reader following it has even odds of opening the wrong one.

### Why not the graph

The obvious source is the vault: it already holds every symbol, it updates incrementally (ADR 0030),
and a watcher keeps it warm (ADR 0036). The argument for it is that the graph *is* the codebase.

It is not, and ADR 0035 says so directly: the graph is "the working tree as of the last pulse. Check
out another branch and the graph silently describes code that is no longer on disk. **Nothing
warns.**" Confirmed live while designing this — `conducks status` against that same repo answered
`This vault predates the current conducks schema`, so the graph could not have verified anything at
all.

For most commands a stale graph yields a stale answer, which is bad. For a rot detector it yields a
**false green** — a lying page reported clean. That is strictly worse than having no gate, because it
looks like coverage, and the whole purpose of this gate is to be trusted when it is silent.

## Decision

**A new command, `conducks visuals-lint`, that checks the DERIVED half of a visual against the
filesystem.** The authored half is never judged.

The split is ADR 0001 applied one level down, inside a single file. Whether `handleTranscript` still
exists, and whether `VAD_THRESHOLD` is still `0.5`, are computable — so they are enforced. Why the
drawing was made, what breaks when it changes, and which findings are defects are authored — so no
linter has an opinion on them.

**Four claims are checked, in increasing strength:**

| claim written | verified | catches |
|---|---|---|
| `path` | resolves to exactly one tracked file | a moved or deleted file |
| `path:line` | the file still has that many lines | deletions and large shrinks |
| `path::symbol` | a *definition* of the symbol exists | renames |
| `NAME=value` | the file assigns `NAME` and the value still matches | **semantic drift** |

The last one is the reason to build this at all. A stale line number is an inconvenience a reader
recovers from in seconds. A threshold that changed under the page leaves the page *actively wrong*
while still looking precise, and there is no way to notice by reading.

**An ambiguous abbreviation is an ERROR, not a best guess.** `index.ts` matches dozens of files in any
real repo. Resolving to one of them would let the gate "verify" an anchor against a file the author
never meant — a false green produced by the gate itself. The refusal forces a longer path into the
page, which is the actual fix, and it is what surfaced the two-`dispatch.ts` collision above.

**A page with no anchors is reported, not passed.** Nothing in it can ever be verified. This is the
ADR 0044 / 0073 / 0123 / 0124 shape: nothing-checked must never render as clean.

**A repo with no `visuals/` exits 0 and says so.** Here this differs from `docs-lint`, deliberately.
Every project is expected to have docs, so an empty tree there is a failure; §6.13 says a picture is
created only when someone asks for one, so most repos will never have visuals and a red gate would
train people to ignore it.

**Warnings do not fail the run; errors do.** The symbol check is a heuristic over text, not a parse.
A heuristic must not be able to block a commit, or the gate gets disabled and the real errors leave
with it.

**The lint is pure; discovery is the caller's.** `lintVisuals(pages, files, read)` takes its file list
and its reader as arguments. Composition wires the file list from `chronicle.discoverFiles()`. This
keeps the docs layer connection-free (CONDUCKS-24), makes every case above a unit test rather than a
fixture repository, and — structurally — makes it impossible to point the gate at a vault by accident.

`visuals-lint` joins `NEEDS_NO_REGISTRY` and `STALENESS_BYPASS` (ADR 0033): it reads authored HTML and
the filesystem, so it must not load twelve grammars and a graph to answer.

## Consequences

The standard's one unenforced folder becomes enforceable, and a diagram can be trusted the way a
linted doc is: silence means checked.

First run against the reference repo: **158 anchors verified true, 10 broken, 1 unverifiable page** —
and every one of the 10 was an ambiguous abbreviation, including a genuine wrong-file hazard. None of
them were catchable before.

The gate is bounded on purpose, and three things stay out of reach:

- **A line number that still exists but now points elsewhere.** The file did not shrink, so nothing
  fires. This is why `::symbol` anchors are preferred, and why the standard already recommends them.
- **Prose that has gone stale.** No linter can check "the funnel does four things".
- **Whether a diagram omits something it should show.** Absence is invisible to a checker.

**Two corrections came from running it, and both are the same mistake.** The first pass read only the
top level of `visuals/` and only `<title>` and `.file`. On a tree that had grown a subfolder and a
second anchor style it checked 124 of 198 anchors — and printed "clean". Both are now fixed (the walk
recurses; the marked-context list is stated in the standard, §5.4), and both were the failure this ADR
already names for pages: **a gate that checks less than it appears to is worse than no gate**, because
the number it prints is believed. It applies to the gate itself, which is easy to forget while writing
one.

The `NAME=value` check reads a literal assignment and a Python `os.environ.get(..., "default")`.
Anything computed reads as absent rather than wrong — a missing check, never a false alarm, which is
the correct direction for a gate that must stay trusted.

Freshness — a visual recorded as reviewed against the hash of the file set it cites, drifting when
those files change — is the natural next layer and reuses the `.conducks/doc-reviews.json` mechanism
already built for `MODULE.md` (`driftedReviews`). It is not built here; todo45 owns it. This decision
deliberately ships the checkable half first, because a rot *warning* is only worth having once the
anchors it points at are known to resolve.
