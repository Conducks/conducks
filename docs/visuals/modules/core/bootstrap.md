# core/bootstrap — what has to happen before any question can be answered

**Layer:** core. One file, `core/bootstrap/registry-bootstrapper.ts`.

**Read at `7c11bc4`.** Until 2026-08-17 this was a loose file at the core root with no door, reached
directly by composition — the third of three features the campaign's census missed.

**Responsibility:** environment discovery, grammar initialisation, and anchor resolution. Which
directory is the project root, is a native grammar available, which vault does this checkout use.
Kept out of the composition root so that root stays a wiring point rather than a procedure.

**Boundaries:** it sets things up and answers nothing. No query goes through here.

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
