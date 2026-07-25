# 0005 — Clean Architecture layer contract
Status: Accepted
- Date: 2026-07-17
- Promoted: enforced as a default rule since 2026-07-25 (todo06 Phase 4 — the gate had never actually run before then); current state in `architecture/README.md` and `governance/sentinel/MODULE.md`. A second launcher exception (cli → mcp) was added beside cli → web.

## Context
conducks self-analysis showed the codebase was 90% cleanly layered but had ~90 illegal
cross-module edges, mostly because `registry/` conflated two roles: the shared component
contract (ConducksComponent, imported by everything) and the composition root (the wiring
object). A contract everyone implements belongs at the bottom; wiring belongs at the top.
Living in one folder produced edges in both directions and made the layering look tangled.

## Decision
Adopt a Clean / Hexagonal layer contract, enforced downward-only:

  contracts (leaf)  ←  core  ←  domain  ←  composition  ←  interfaces {cli, mcp, web}

- contracts (src/contracts): shared interfaces/types. Imports nothing.
- core (src/lib/core): primitives — graph, persistence, parsing, git. Imports contracts only.
- domain (src/lib/domain): logic over core. Imports core + contracts.
- composition (src/registry/index.ts): DI / wiring root. Imports core + domain + contracts.
- interfaces (src/interfaces/{cli,tools,web}): entry points. Import composition. NEVER each other,
  with one allowed exception: the `mirror` CLI command launches the web server (a launcher edge,
  not logic coupling).

The allowed-dependency table is encoded as `ALLOWED_DEPENDENCIES` in governance/sentinel-rules.ts
and enforced by the `layer_boundaries` sentinel rule, run by `conducks guard`.

## Consequences
Domain services are injected (constructor), never pulling the global composition root, so they are
testable in isolation. `conducks guard` blocks any new illegal cross-layer edge — the architecture
cannot silently erode; the tool enforces its own structure. Physical service separation is
deliberately NOT adopted (90% cohesion, zero deploy benefit); the clean adapter isolation keeps
future extraction cheap if a service ever needs independent deployment. Wiring the sentinel rules
into guard also revealed pre-existing findings (1 import cycle, 37 rank inversions) that predate this
contract and are tracked in todo06 — not blocked by the layer gate.
