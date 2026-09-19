# core/bootstrap — what has to happen before any question can be answered

**Layer:** core. One file, `core/bootstrap/registry-bootstrapper.ts`.

**Read at `7c11bc4`.** Until 2026-08-17 this was a loose file at the core root with no door, reached
directly by composition — the third of three features the campaign's census missed.

**Responsibility:** environment discovery, grammar initialisation, and anchor resolution. Which
directory is the project root, is a native grammar available, which vault does this checkout use.
Kept out of the composition root so that root stays a wiring point rather than a procedure.

**Boundaries:** it sets things up and answers nothing. No query goes through here.

**Uses:** imports and wires [core/graph](graph.md) (`ConducksGraph`, `FederatedLinker`),
[core/persistence](persistence.md) (`SynapsePersistence`), [core/git](git.md) (`chronicle`,
`anchorChronicle`), [core/parsing](../parsing.md) (`grammars`, `IgnoreManager`) and
[core/utils](utils.md) (`logger`, `traceMemory`, `isNeverAProjectRoot`) — every other core door at
once, which is what makes it the one feature core must never import back.

## It sits ON TOP of every other core door

It imports graph, persistence, git, parsing and utils. That makes it the one feature in core that
must never be imported BY them, and the door gate is what keeps that true — nothing in core does, and
its single consumer is `src/registry/index.ts`.

## A tension, recorded rather than resolved

A file that wires five features together and is used by exactly one composition root reads like
composition that was placed in core. Moving it to `src/registry/` would be legal under ADR 0005 and
is arguably where it belongs.

That decision waits for the composition-root unit, which this campaign deliberately does last.
Deciding it here would mean deciding the shape of a layer nobody has measured yet — and this project
has already paid twice for a structural call made ahead of its measurement.

## The lazy graph is the part worth knowing

`registry-bootstrapper.ts` carries `pendingLoad`, the deferral that lets a read-only command answer
without materialising the graph. Materialising costs roughly 165 MB and 146 ms for 2,381 nodes, and a
read-only caller frequently walks no node at all.

The trap it holds: a deferred graph reads as an EMPTY one. Four of six MCP tools broke that way and
three broke silently — no error, just zero results. Anything that WALKS must call
`ensureGraphLoaded()` first, and the registry's `graphEngine` getter makes forgetting a loud failure
at the call site instead of a wrong answer downstream.

## Features
- none — this is setup, not a queryable capability

## Glossary
- **pendingLoad** — the deferral `registry-bootstrapper.ts` carries so a read-only command can answer
  without materialising the graph; cleared only inside the re-anchor branch, never on every call.
- **anchor** — the directory `bootstrap` resolves as the project root before anything else runs;
  distinct from `anchorChronicle`, the [core/git](git.md) operation that points the chronicle at it.
  **Not the anchor [domain/docs](../domain/docs.md) means** — that one is a `file:line` claim in a
  visual. Same word, unrelated things; `conducks glossary` reports the pair on purpose.

## Traps
- **`initialize()` used to clear `pendingLoad` on every call, including ones that changed nothing.**
  It sat at the top of `RegistryBootstrapper.initialize`, which runs on every tool call, and clobbered
  an already-armed deferred load. It got away with it only because the same call then fell through a
  re-init path that re-armed it — once that path stopped running for an unchanged anchor, the graph
  stayed deferred forever and every tool answered as though the graph were empty. `pendingLoad` is now
  cleared only inside the re-anchor branch.
- **A staleness-bypass flag that guards the WARNING does not mean the load was skipped.** Commands
  read as "skip the graph" from `isStalenessBypass`'s name, and they do not — `registry.initialize()`
  runs its own `persistence.load(graph)` before the bypass is even checked, so every one of those
  commands still loads the whole graph, one call earlier than the flag can see. A command that truly
  skips graph work must be in the separate `NEEDS_NO_REGISTRY` set, which skips `initialize` entirely.
