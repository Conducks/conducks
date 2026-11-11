# interfaces/web — the mirror

**Layer:** interfaces. Legally imports composition, domain, core and contracts
(`sentinel-rules.ts:70-72`). Reached from the CLI through exactly one launcher edge: `cli → web`
(`interfaces/cli/commands/mirror.ts:3` imports `initGlobalMirror`), the deliberate exception the
layer contract encodes rather than routing a process entry point through composition
(`src/lib/domain/governance/sentinel-rules.ts:66-72`; the CLI side of this same edge is documented
in [interfaces/cli](cli.md)).

**Responsibility:** the mirror — a live visual dashboard over the analysed codebase. This note
covers both halves: `src/interfaces/web/mirror/server.ts` (an express server, `MirrorServer`) and,
beside it, `src/interfaces/web/mirror/public/` (the page itself: `index.html`, `app.js` and
`styles.css`, with no library and no build step). The DATA half —
answering the project map, one file, one symbol and a name search — is `GatewayService`, `src/lib/domain/mirror/`, a
domain door the web server holds by composition, not by inheritance.

**Boundaries:** the domain door may not hold an interface asset, so the mirror genuinely spans two
layers — the express server and static page live in `interfaces/web`, the data service lives in
`domain/mirror`, and `tests/architecture/feature-doors.test.ts:65` fails the build if anything
outside `src/lib/domain/mirror/` reaches past its door
(`src/lib/domain/mirror/index.ts`, which re-exports `GatewayService` from `src/lib/domain/mirror/gateway.ts`).
The API routes
(`/api/overview`, `/api/file`, `/api/symbol`, `/api/search`, `/api/governance`, `/api/pulse`, plus
`/api/synapse` and `/api/node/:id`, which the page no longer calls) are unauthenticated;
`MirrorServer.start` defaults to binding loopback only and warns loudly if a caller opts into a
wider host (`src/interfaces/web/mirror/server.ts`, `start()`).

**Uses:** `registry.mirror.createGateway(projectRoot)` (`src/registry/index.ts:397-400`) wires
`GatewayService` against the composition-owned graph and persistence singletons; the gateway itself
reads `core/persistence` and answers the map from SQL (`GatewayService.overview`, `fileDetail`,
`symbolDetail`, `search`), never by walking the in-memory graph (ADR 0054). The Health
section of the page calls `registry.audit.audit()` /
`registry.audit.advise()` through `/api/governance`. Live updates ride one SSE channel
(`/api/pulse`): the evolution watcher and the docs watcher both subscribe their pulses to
`MirrorServer.broadcastPulse` (`initGlobalMirror`, `src/interfaces/web/mirror/server.ts:226-235`) —
dependency inversion so `domain/evolution` and `domain/docs` do not import web themselves.

**Deferred / not built:** the data half is mid-refactor as of 2026-09-18. `src/lib/domain/visual/`
and its `MirrorEngine` are deleted (ADR 0190, see Traps below); `src/lib/domain/mirror/` is the new
door, currently just `index.ts` + `gateway.ts`. The gateway's own code comments (`getWave`) still
narrate the old `MirrorEngine.getVisualWave` / broken `getCompactWave` cast as history, not as a
live path — read `src/lib/domain/mirror/gateway.ts` directly rather than this note if a claim here
goes stale, since this area is actively moving and was not committed at the time this note was
written.

## Features

- **One stage** (`conducks mirror`) — the module diagram fills the screen: modules in layers, links
  as lines with pulses running from the module that uses to the one that is used. A module is a top
  folder of the source, split further while one folder holds most of the code.
- **Every level is a small codebase** — clicking a module goes inside it: its sub-folders and files
  become the diagram, the outside modules that use it sit along the top and the ones it uses along
  the bottom, and a trail leads back. It repeats down to a single file, which shows the files that
  use it above and the files it uses below. A START label marks where the program begins, at every
  depth. Hovering a box previews what a change to it can reach.
- **Readings** — a strip above the stage: a score ring and six checks (two-way links, import loops,
  overloaded files, unused code, risky untested files, oversized files), plus two guides (where to
  start, how it runs). Choosing one lights up the same diagram where that problem lives.
- **Card** — one card, on request, six rows at most: a reading's worst files, a module's reach and
  the files the outside uses, a file, or a function.
- **Search** — `/api/search` finds functions and types by part of their name.
- **Health** — `/api/governance` surfaces `registry.audit.audit()` in the page: cycles, hubs,
  orphans; the same audit the CLI runs.
- **Live pulse (SSE)** — `/api/pulse` pushes a reload signal to every connected browser tab when the
  vault changes (`GatewayService.watchSynapse`, a `fs.watch` on the DuckDB file with a 1250ms debounce
  for in-flight multi-stage writes) or when a doc is saved (the docs watcher).

## Glossary

- **overview** — the `{root, files, deps, hotspots, entries}` payload the page draws from. `deps`
  holds `[from, to, count]` as indexes into `files`, so a path is sent once. The whole page with
  this data was 185 kB for conducks itself (1,184 files).
- **wave** — the older `{nodes, links, clusters, truncated, totalNodes}` payload behind
  `/api/synapse`. The force graph that drew it was removed (it showed every symbol as a dot, with
  no structure a reader could use); the route stays until its last caller is confirmed gone.
- **pulse** — a `{type: 'PULSE', timestamp}` (or docs-watcher) event broadcast over `/api/pulse`
  telling every open mirror tab to re-fetch, never carrying the changed data itself. **Not the pulse
  [domain/analysis](../domain/analysis.md) means** — that one is an analyze run. This is only the
  notification that one finished.

## Traps

- **The page is checked structurally, not by rendering.**
  `tests/unit/interfaces/mirror-frontend-is-wired.test.ts` checks that every id `app.js` reaches
  exists, every class it sets is defined, the page loads only its own two files, and every endpoint
  it calls is a route. `tests/unit/domain/mirror/overview.test.ts` checks the data. Nothing asserts
  what a browser draws: a hand-written DOM shim would pass because its author read the renderer.
  Verify a change to `app.js` by running `conducks mirror` and looking at a real browser.
- **API requests are served one at a time.** Every route opens the vault and closes it when done,
  so the lock is free for `analyze`. Two overlapping requests closed it under each other and the
  second answered HTTP 500, which is how the page's six parallel file requests failed
  (`src/interfaces/web/mirror/server.ts`, the `/api` middleware).
- **Two designs were tried and removed before this one.** Boxes sized by lines showed structure and
  answered nothing. A menu of questions with tables answered them, but was wordy and looked dated.
  Keep the rules the third design follows: the picture is the page, colour only for problems, one
  card at a time.
- **The force graph never drew in the shipped build.** Its vendored `d3-force` UMD file needed
  `d3-quadtree`, `d3-dispatch` and `d3-timer` on the global `d3` and none was vendored, so the page
  threw `t.quadtree is not a function` (found 2026-11-11). A static page with vendored libraries has
  no build to catch a missing one; the current page uses no library at all.
- **`MirrorEngine` and `src/lib/domain/visual/` are deleted — do not re-add them.** ADR 0190 removed
  both; the visual wave has been answered from SQL since ADR 0054
  (`GatewayService.getWave`, `src/lib/domain/mirror/gateway.ts`), and nothing on any live path calls
  the old engine. It survived earlier sweeps because a barrel re-export counted as an incoming edge
  to `prune` and because `tests/unit/adr-invariants.test.ts` once asserted the FILE existed rather
  than the rule it carried; that invariant now asserts `domain/visual` does NOT exist. If a
  refactor of this area reaches for an in-memory graph walk to answer the wave, that is the same
  mistake returning — the SQL path is the one to extend.
