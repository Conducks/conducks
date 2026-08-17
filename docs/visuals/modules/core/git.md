# core/git — the repository, asked once

**Layer:** core. Two files: `core/git/chronicle-interface.ts` and its door. Imports `contracts` and
`core/utils`, nothing else — a true leaf, which is why it was the first feature cleaned.

**Read at `7c11bc4`.**

**Responsibility:** every question that needs `git` to answer it. Which files exist, which branch is
checked out, who touched a file and when, what a ref resolves to.

**Boundaries:** it runs git and returns what git said. It does not decide what a file MEANS — a
`.py` and a `.md` come back the same way — and it never writes to a repository it is reading, which
is why `core.quotePath=false` is passed per-invocation rather than set in the repo's config.

## Discovery asks EVERY repository under the anchor, not just the anchor's own

`ls-files` in the root of a repository does not descend into a nested checkout — it names the
directory and stops. So a vendored dependency, a submodule or a test fixture with its own `.git` is
invisible to it.

Measured on this repository while cleaning the monitor: a private `ls-files` copy saw 575 source
files and `discoverFiles` saw 578. The three were every file under a nested fixture checkout, and
`status` had been reporting a smaller tree than `analyze` ingested with no test aware of it (ADR 0069).

There is a matching trap in the other direction. A file can sit in the workspace and inside NO
repository — the `conducks.json` that DECLARES a workspace whose services each carry their own
`.git` is exactly that file. Git partially succeeds there, so returning early would silently drop
every root-level file; measured on the fixture, 5 units became 4 and the missing one was the
declaration defining the workspace.

## The anchor is a named operation, not a method

`chronicle` is one instance held by two dozen files. While `setProjectDir` was reachable on it, any
of them could point the whole process at another directory mid-run — and nothing would report it,
because every later answer would simply be about a different tree.

The door hands it out as `ReadOnlyChronicle`, the class minus that one mutator. Moving the anchor is
`anchorChronicle(root)`, used at three sites that all anchor at boot or at a resolved CLI target.

**What that does NOT claim:** the instance is still shared and the method still exists at runtime. A
cast still reaches it. What is gone is the ACCIDENTAL case — a mutator reachable on every handed-out
reference — which is the one that actually happened. The test says so out loud rather than implying
a guarantee the type cannot make.

Anything needing a DIFFERENT root constructs its own `ChronicleInterface`. That is what let
`project-monitor` stop re-implementing two git operations: the duplication existed because the door
exported a singleton, not because the class could not answer per root.
