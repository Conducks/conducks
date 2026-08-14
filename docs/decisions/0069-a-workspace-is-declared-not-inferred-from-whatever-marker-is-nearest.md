# 0069 — a workspace is declared, not inferred from whatever marker is nearest
Status: Accepted
- Enforced by: tests/unit/core/root-discovery.test.ts (a declared workspace wins over a nearer package marker and over a stray vault, and a single repo with no declaration still resolves exactly as before)
- Amends: 0039
- Date: 2026-07-31

## Context

conducks was pointed at a monorepo it had never seen — `subject-b`, which declares five services in
a `conducks.json` at its root and carries per-service `docs/` trees. Two things came out of it, and
they are the same defect seen from opposite ends.

**One repository ended up with several partial vaults.** `discoverRoot()` walks up from the target
looking for the nearest marker: `.conducks`, then `.conducksignore`, then any of `package.json`,
`tsconfig.json`, `go.mod`, `Cargo.toml` … or `.git`. **`conducks.json` is not in that list.** So:

| analyzed | anchored at | vault | held |
|---|---|---|---|
| `subject-b/app` | `subject-b/app` | `app/.conducks` | 3,412 nodes |
| `subject-b/database` | `subject-b` | `.conducks` | **40 nodes** |

`app` scoped correctly BY ACCIDENT — it happens to have its own `package.json`. `database` is a
declared service with none, so the walk continued to the repository root and planted a vault there
holding 40 nodes. That vault sits where a reader would most trust it and describes 1% of the
codebase. Analyzing all five services would produce four vaults, none of which sees the monorepo.

**And cross-service imports cannot resolve, so they are invented instead.** `app/tsconfig.json` maps
`@/core` to `../packages/core`, outside the analyzed scope. Of 470 dangling edge targets, 181 are
`IMPORTS` and **163 of those name `@/core` or `@/product`**. The worst single phantom carries 106
references. This is not a second bug: the other service is not in the vault, so there is nothing to
resolve against.

ADR 0039 already knew. Its own `Enforced by:` line records that "`discoverRoot()` still answers the
boundary question independently of `conducks.json`". The half was specified and never built, and
this is what it costs.

**Three topologies have to work, and one of them is currently impossible.**

| | `.git` at root | `.git` per service | today |
|---|---|---|---|
| single repo, services inside | yes | — | partly, by luck |
| nested repos / submodules | yes | yes | history reads from the wrong repo |
| no root repo, each service its own | **no** | yes | **cannot anchor at all** |

The third has no marker at the workspace root whatsoever. Nothing in the walk can find it. A
declaration is the only thing that could.

## Decision

**`conducks.json` declares the workspace, and it outranks every inferred marker.** It is checked
first in `discoverRoot()` — above `.conducks`, because a declaration is a statement of intent and a
vault is an artifact. That ordering also self-heals a tree that already has stray vaults: once the
declaration wins, `app/.conducks` stops being authoritative.

**One workspace, one vault. The target path selects SCOPE, never LOCATION.**

| run | vault | analyzed |
|---|---|---|
| `analyze subject-b/` | `subject-b/.conducks` | all five services |
| `analyze subject-b/app` | `subject-b/.conducks` | app only |
| `analyze subject-b/database` | `subject-b/.conducks` | database only |

A partial analysis must therefore purge only its own scope, not the vault.

**The workspace root and the git root are two different questions and stop being one field.**
`chronicle.setProjectDir(effectiveRoot)` currently makes them the same directory. That is invisible
in a single-git repository and wrong in the other two topologies: a file under `app/` whose history
lives in `app/.git` cannot be blamed from the workspace root. The git root is resolved per file, by
walking up to the nearest `.git`; the workspace root keeps deciding where the vault lives.

**A repository with no `conducks.json` behaves exactly as it does today.** The marker walk is
unchanged below the new first check. This is additive — the single-repo case, which is every project
conducks has ever been run against including its own, is untouched.

**Not chosen: inferring the workspace from the git root.** It is the obvious candidate and it fails
the third topology outright, where there is no root `.git` at all. It also silently disagrees with
the user in the nested case: a submodule has its own `.git` and is usually still part of one
workspace.

**Not chosen: one vault per service, joined at query time.** It keeps discovery simple and makes the
cross-service edge unrepresentable — `app` importing `packages/core` would have each end in a
different database. The 163 phantom imports measured above are exactly that failure, and a join at
read time would not create the node that is missing at write time.

**Not chosen: reading `tsconfig.json` path aliases to widen the scope.** It would resolve `@/core`
for TypeScript and do nothing for the other twelve languages, and it answers "where does this
specifier point" rather than "what is this project" — which is the question actually being asked.

## Consequences

A monorepo gets one vault, so a cross-service edge has both ends in one place and can resolve.
`rootId` gains a service dimension so one vault can answer per-service questions; a query scoped to
one service is a filter rather than a different database.

Anyone whose tree already has several vaults will find the declared root wins on the next pulse and
the stray ones go unread. They are not deleted — deleting a database because a rule changed is not
something a tool should do quietly — so they linger as dead files until removed by hand.

**Only the first two rules are built here. The per-file git root is decided and NOT implemented**,
because the topologies it fixes cannot be tested without building nested-repository fixtures, and
this project has an explicit rule against shipping what it cannot measure. Recorded as owed work
rather than claimed: a single-git repository behaves identically either way, which is precisely why
it would ship broken and unnoticed.

`Open:` whether a service should be able to declare its own nested `conducks.json` and become its
own workspace — a vendored dependency that is itself a monorepo is the case. The rule as written
takes the NEAREST declaration walking up, so a nested one would win for paths beneath it, which is
probably right and is untested. Carried by todo29#P3.
