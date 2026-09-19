# interfaces/web — the mirror

**Layer:** interfaces. Legally imports composition, domain, core and contracts
(`sentinel-rules.ts:70-72`). Reached from the CLI through exactly one launcher edge: `cli → web`
(`interfaces/cli/commands/mirror.ts:3` imports `initGlobalMirror`), the deliberate exception the
layer contract encodes rather than routing a process entry point through composition
(`src/lib/domain/governance/sentinel-rules.ts:66-72`; the CLI side of this same edge is documented
in [interfaces/cli](cli.md)).

**Responsibility:** the mirror — a live visual dashboard over the analysed codebase. This note
covers both halves: `src/interfaces/web/mirror/server.ts` (an express server, `MirrorServer`) and,
beside it, `src/interfaces/web/mirror/public/` (the page itself: `index.html`, `ui.js`,
`resonance.js`, `styles.css`, a `vendor/` folder for `d3-force` and `force-graph`). The DATA half —
answering the visual wave and hydrating a node — is `GatewayService`, `src/lib/domain/mirror/`, a
domain door the web server holds by composition, not by inheritance.

**Boundaries:** the domain door may not hold an interface asset, so the mirror genuinely spans two
layers — the express server and static page live in `interfaces/web`, the data service lives in
`domain/mirror`, and `tests/architecture/feature-doors.test.ts:65` fails the build if anything
outside `src/lib/domain/mirror/` reaches past its door
(`src/lib/domain/mirror/index.ts`, which re-exports `GatewayService` from `src/lib/domain/mirror/gateway.ts`).
The API routes
(`/api/synapse`, `/api/node/:id`, `/api/governance`, `/api/docs`, `/api/pulse`) are unauthenticated;
`MirrorServer.start` defaults to binding loopback only and warns loudly if a caller opts into a
wider host (`src/interfaces/web/mirror/server.ts`, `start()`).

**Uses:** `registry.mirror.createGateway(projectRoot)` (`src/registry/index.ts:571-576`) wires
`GatewayService` against the composition-owned graph and persistence singletons; the gateway itself
reads `core/graph` and `core/persistence` (`getVisualWave`, `fetchNodeDeep`) and answers the wave
from SQL, never by walking the in-memory graph (ADR 0054). The Docs panel reads
`registry.docs.board()` through `/api/docs`, the same source `conducks docs-status` uses — the
graph is not touched for that route. The Governance panel calls `registry.audit.audit()` /
`registry.audit.advise()` through `/api/governance`. Live updates ride one SSE channel
(`/api/pulse`): the evolution watcher and the docs watcher both subscribe their pulses to
`MirrorServer.broadcastPulse` (`initGlobalMirror`, `src/interfaces/web/mirror/server.ts:193-209`) —
dependency inversion so `domain/evolution` and `domain/docs` do not import web themselves.

**Deferred / not built:** the data half is mid-refactor as of 2026-09-18. `src/lib/domain/visual/`
and its `MirrorEngine` are deleted (ADR 0190, see Traps below); `src/lib/domain/mirror/` is the new
door, currently just `index.ts` + `gateway.ts`. The gateway's own code comments (`getWave`) still
narrate the old `MirrorEngine.getVisualWave` / broken `getCompactWave` cast as history, not as a
live path — read `src/lib/domain/mirror/gateway.ts` directly rather than this note if a claim here
goes stale, since this area is actively moving and was not committed at the time this note was
written.

## Features

- **Live force-graph dashboard** (`conducks mirror`) — `MirrorServer` serves the static page from
  `src/interfaces/web/mirror/public/` and the `/api/synapse` wave; the page renders it with
  `vendor/force-graph.min.js` / `vendor/d3-force.min.js`.
- **Node hydration on demand** — `/api/node/:id` calls `GatewayService.hydrateNode`, which merges
  in-memory node properties with a deeper DuckDB read (complexity, entropy, resonance) rather than
  shipping the full deep payload for every node in the wave.
- **Governance panel** — `/api/governance` surfaces `registry.audit.audit()` and
  `registry.audit.advise()` in the browser; the same audit the CLI runs.
- **Docs panel** — `/api/docs` surfaces `registry.docs.board()` (todo progress, ADR states) parsed
  from the authored markdown grammar; see Traps for its coverage gap.
- **Live pulse (SSE)** — `/api/pulse` pushes a reload signal to every connected browser tab when the
  vault changes (`GatewayService.watchSynapse`, a `fs.watch` on the DuckDB file with a 1250ms debounce
  for in-flight multi-stage writes) or when a doc is saved (the docs watcher).

## Glossary

- **wave** — the shallow `{nodes, links, clusters, truncated, totalNodes}` payload `getVisualWave`
  answers for the dashboard; capped by default (`--wave-cap`, `mirror.ts`) because an unreadable
  ten-thousand-node graph is not useful, not because the rest is uninteresting. **The page SAYS when
  it is capped** — the status bar reads "N of M nodes" whenever the wave truncates, so a partial
  picture cannot be mistaken for the whole graph (ADR 0054). That is why `truncated` and `totalNodes`
  are in the payload at all: a cap nobody is told about is a wrong answer delivered confidently.
- **pulse** — a `{type: 'PULSE', timestamp}` (or docs-watcher) event broadcast over `/api/pulse`
  telling every open mirror tab to re-fetch, never carrying the changed data itself. **Not the pulse
  [domain/analysis](../domain/analysis.md) means** — that one is an analyze run. This is only the
  notification that one finished.

## Traps

- **The Docs panel has no automated coverage of what it renders, deliberately.** `loadDocs()`
  (`src/interfaces/web/mirror/public/ui.js:107`) builds the panel's DOM from the `/api/docs`
  payload, and nothing in the suite exercises what it *builds*:
  `tests/unit/interfaces/tools/docs-layer.test.ts` covers only the `/api/docs` payload itself, and
  `tests/unit/interfaces/mirror-frontend-is-wired.test.ts` checks the page STRUCTURALLY — every id
  the scripts reach exists, every class they set is defined, no external resource, every cross-file
  call resolves — but asserts nothing about what `loadDocs`, `loadGovernance` or
  `window.onDocsPulse` (`ui.js:33`, `ui.js:40-46`) actually render. A prior hand-written DOM shim
  used to check the rendered output and was deliberately not kept: it would pass because its author
  read the renderer, and keep passing after a change that breaks a real browser. Verify any change
  to `loadDocs` / `loadGovernance` / `window.onDocsPulse` by running `conducks mirror` and looking
  at a real browser — do not simulate one.
- **`MirrorEngine` and `src/lib/domain/visual/` are deleted — do not re-add them.** ADR 0190 removed
  both; the visual wave has been answered from SQL since ADR 0054
  (`GatewayService.getWave`, `src/lib/domain/mirror/gateway.ts`), and nothing on any live path calls
  the old engine. It survived earlier sweeps because a barrel re-export counted as an incoming edge
  to `prune` and because `tests/unit/adr-invariants.test.ts` once asserted the FILE existed rather
  than the rule it carried; that invariant now asserts `domain/visual` does NOT exist. If a
  refactor of this area reaches for an in-memory graph walk to answer the wave, that is the same
  mistake returning — the SQL path is the one to extend.
