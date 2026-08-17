# 0039 — a vault describes the tree beside it, and a service is a service everywhere
Status: Accepted
- Amended by: 0069, todo21 — the `conducks.json` half this record calls "not built at all" SHIPPED: `discoverRoot` reads a declaration as PASS 1 and returns before the marker walk, so a declared root now wins where both exist (`registry-bootstrapper.ts:64`). The paragraph below describes the state at the time of writing
- Enforced by: tests/unit/core/bootstrap/root-discovery.test.ts (root discovery refuses a directory the scope guard already calls impossible, so one stray vault cannot claim the tree above it, and a real project is still found by its vault alone) — PARTLY. The worktree half is current behaviour and untested, and `discoverRoot()` still answers the boundary question independently of `conducks.json`; see Consequences.
- Date: 2026-07-28

0069 built the half this record specified and left unbuilt. Its own `Enforced by:` line already
said so — "`discoverRoot()` still answers the boundary question independently of `conducks.json`" —
and the cost was measured on a real monorepo: one repository ended up with several partial vaults,
and 163 cross-service imports resolved to phantom symbols because the other service was not in the
vault to resolve against.

## Context

Two questions had no answer, and ADR 0035's commit-keyed layers would have made whichever answer
arrived by accident into a structural one.

**Worktrees.** Two checkouts of one repository, each with its own `.conducks/`. It accidentally
works today, and two vaults then describe one repository — which is either correct or a bug, and
nothing said which.

**Monorepos.** Is `packages/api` its own project or part of one? `conducks.json` already answers
this for the docs layer, and the vault answered it separately by walking up to the nearest marker.
Two notions of "project" that can disagree is worse than either notion.

## Decision

**A vault describes the working tree beside it.** A linked worktree gets its own `.conducks/`, and
that is correct rather than tolerated. Each checkout is a different tree at a different commit, so
two vaults describing two states is the honest answer — and it is the same answer ADR 0035 reaches
from the other direction, where a layer is keyed by commit and two commits are two layers whether
or not they share a file.

**A service is a service everywhere.** The vault boundary is whatever `conducks.json` declares for
the docs layer. One declaration, two consumers.

**Not chosen: one shared vault per repository, keyed by commit.** It saves disk and keeps
cross-worktree edges resolvable, and it moves the lock from per-tree to per-repository — so a pulse
in one worktree would block reads in the other, which is the opposite of why people use worktrees.
It also has to put the vault somewhere neither tree owns, and "the vault sits next to the code" is
worth more than the disk.

**Not chosen: refusing worktrees until 0035 lands.** Considered, because a silently-created second
vault is the kind of thing this project keeps finding. Rejected because the behaviour is correct —
there was nothing to refuse, only something to write down.

**Not chosen: a per-package vault derived from `package.json`.** It needs no declaration, and it can
disagree with `conducks.json` about what a service is. A boundary that two subsystems compute
independently is a boundary that drifts.

## Consequences

Worktrees cost disk proportional to how many are open, and a pulse in one does not help another.
Both are acceptable and neither is surprising once stated.

Nothing changes today for a single-checkout repository, which is why this record exists at all: the
current behaviour was never wrong, it was merely undecided, and an undecided behaviour becomes a bug
report the first time someone reasons about it.

The vault must stop discovering its own boundary. `discoverRoot()` walks up to the nearest marker —
`.conducks`, `package.json`, `.git` and others — which is a second answer to the question
`conducks.json` already answers. Where both exist, the declaration wins.

**This record is only partly enforced, and that is stated rather than left for the board to imply.**
The worktree half describes what conducks already does, so it is true today and nothing would notice
if it stopped being true — a test that pulses two worktrees of one repo and asserts two vaults is
what would pin it. The `conducks.json` half is not built at all: `discoverRoot()` still walks up to
the nearest marker and answers the boundary question on its own, so the declaration does not yet win
where both exist. `todo21#P0` carries both.

The cost of leaving it unbuilt stopped being hypothetical on 2026-07-29. `discoverRoot()` treated a
`.conducks` directory as proof of a project root, so one vault left in `/private/tmp` three days
earlier made every marker-less folder beneath it resolve there — two benchmark projects analyzed
2,323 unrelated files instead of their own source, and the resulting out-of-memory failure was
recorded against projects that were never being analyzed. The immediate hole is closed: root
discovery now refuses any directory the scope guard already calls impossible, reusing that predicate
rather than keeping a second list, which is this record's rule applied to the one place it was being
broken. That is a narrowing, not the decision — the declaration still does not win.


`Open:` one vault per service, or one vault whose rows carry a service column. The column is the
better shape — cross-service edges stay resolvable and there is one lock rather than N — but it is
not decided here and no measurement supports it yet. `todo21#P0` carries it.
