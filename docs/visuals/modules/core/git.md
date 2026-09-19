# core/git — the repository, asked once

**Layer:** core. Two files: `core/git/chronicle-interface.ts` and its door. Imports `contracts` and
`core/utils`, nothing else — a true leaf, which is why it was the first feature cleaned.

**Read at `7c11bc4`.**

**Responsibility:** every question that needs `git` to answer it. Which files exist, which branch is
checked out, who touched a file and when, what a ref resolves to.

**Boundaries:** it runs git and returns what git said. It does not decide what a file MEANS — a
`.py` and a `.md` come back the same way — and it never writes to a repository it is reading, which
is why `core.quotePath=false` is passed per-invocation rather than set in the repo's config. Every
subprocess is spawned with `execFileSync` and an argument array, never a shell string — a path or ref
that reaches the shell as a concatenated string is a command-injection surface, and an argument array
is not. Discovery goes git-direct through this interface rather than through any other
file-enumeration path, because git already tracks what a plain directory walk cannot (deleted,
renamed, submodule-nested files).

**Uses:** imports [contracts](../contracts.md) and [core/utils](utils.md), nothing else — the leaf
status stated above.

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

## Three call sites still inline `toRepoRelative`, and collapsing them changes behaviour

`readSingleFile`, `getAuthorDistribution` and `getBlameData` each do by hand what
`toRepoRelative` (<span class="anchor">src/lib/core/git/chronicle-interface.ts:532</span>) already
does. The comment that once sat above it claimed the duplication had been removed; it had not, and a
comment is held to the same bar as any other doc.

It stays deferred on purpose rather than tidied: collapsing the three onto the helper changes
behaviour on the case-insensitive path, and behaviour does not change during a clean — a fix is its
own commit with its own measurement. Whoever takes it needs a case-collision fixture first.

## Features
- none — one interface, no user-facing sub-capability of its own

## Glossary
- **anchorChronicle(root)** — the named operation that points the shared chronicle instance at a
  directory. Used at three sites, all at boot or a resolved CLI target — never a bare `setProjectDir`
  reachable on every handed-out reference.
- **ReadOnlyChronicle** — the type the door hands out: the chronicle class minus its one mutator.

## Traps
- **Reading a git ref is cheap; reading it per file is not.** `git archive <ref>` reads a whole
  551-file, 4.4 MB repo in ~53 ms; `git show <ref>:<path>` per file measured at ~5,655 ms for the
  same set — 107x slower, because each call is its own process spawn. Any design that reaches for
  per-file `git show` in a loop is paying roughly 100x for nothing that a single whole-ref read would
  answer.
- **git QUOTES a path containing a non-ASCII byte, and the quoted string opens nothing.**
  `core.quotePath` defaults to true, so `git ls-files` returns a non-ASCII filename as a literal
  quoted, octal-escaped string. Taken as a path it opens nothing, so the file drops from the graph
  with only "skipped 1 unreadable file" to show for it — correct on a repo naming files in ASCII,
  silently wrong on one naming them in Turkish, French or Chinese. `-c core.quotePath=false` per
  invocation is the fix; never write it into the analyzed repo's own config.
