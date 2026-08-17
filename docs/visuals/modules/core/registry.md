# core/registry — file to provider, id to component

**Layer:** core. One file, `core/registry/synapse-registry.ts`. Imports `contracts` and nothing else.

**Read at `7c11bc4`.** No door and no note until 2026-08-17 — one of the three core features the
campaign's own census missed.

**Responsibility:** the map from a file to the provider that can parse it, and from an id to a
registered component. The smallest feature in core and the most widely held: persistence,
composition and two domain services each keep one.

**Boundaries:** it stores registrations and answers lookups. It decides nothing about what a provider
does, and it never constructs one — `src/registry/index.ts` builds the provider list and hands them
over in precedence order, first claimant keeping a pattern.

## Why the BOOTSTRAPPER is not in here, though the names say it should be

`RegistryBootstrapper` fills a registry, so `core/registry` reads like its home. It has its own door
at `core/bootstrap` instead, and the reason is mechanical rather than aesthetic.

That class imports the graph, persistence, git, parsing and utils doors. `core/persistence/persistence.ts`
imports THIS one. Re-exporting both through a single door would make

    persistence → registry → bootstrapper → persistence

a cycle — because a door is itself a dependency edge, and importing one pulls in everything it
re-exports (ADR 0150 rule 5b).

That is not a hypothetical. The graph door closed exactly this kind of cycle once, nothing failed to
compile, and a single unrelated test failed instead. Rule 5b exists because of it.

So this door stays a LEAF: one class, one import, safe for anything in core to hold.
