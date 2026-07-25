# Handover — 2026-07-25
Status: current

## Where it stands
- **todo12 closed** — a 13-agent truth pass over the skills and both repos' docs. All 8 skills now name
  only live MCP tools, enforced by a test (ADR 0018). `conducks-guide` lost the ~80 lines of
  frontend/backend/security guidance ADR 0006 had already ordered deleted. Tool count is derived in one
  place (was asserted four ways: 9, 12, 13, actual 14).
- **Six real bugs fixed, none of them in scope when the pass started.** `conducks record` never worked
  (`registry.manifest` does not exist; an `as any` hid it). `conducks setup` registered Claude Desktop
  against `<project>/build/index.js`, a path that never exists, with no `mcp` arg — so every
  auto-registered server silently failed to start. `audit` read a cwd-relative `config/sentinel.json`,
  evaluating zero policy rules outside the project root while printing "Governance confirmed".
  `coverage-view` still had todo08's basename bug. `conducks explain` never printed `complexity`, its
  largest-weighted signal. MCP `conducks_impact`'s two mode descriptions were swapped end-for-end.
- **ADR 0005's layer contract is NOT enforced** — `guard` prints "Layer contract clean" because
  `layer_boundaries` is absent from `getDefaultRules()` and no `.conducks/sentinel.yml` exists. Measured
  with the rule force-enabled: ~71 illegal edges across 5 layer pairs. Deliberately NOT enabled — it
  would hard-block. **todo06 is reopened**: it had been closed on this exact criterion.
- **Java, PHP and Swift extraction is dead.** Proven empirically on a 12-language repo: their query
  files fail to compile against the installed grammars (`TSQueryErrorStructure` @921,
  `TSQueryErrorNodeType` @146 and @199), so every file in those languages degrades to a single
  file-only node. The README's support table said "experimental"; it now says broken. No todo covers it.
- **Docs are smaller and true**: `memory.md` 30 → 24 entries, `features.md` 50 → 46 with every heading
  naming its command (was 5 of 50) plus a 26-row `## Tunables` table, 5 new conventions
  (CONDUCKS-13…17) promoting ADR consequences that had lived only inside immutable records, 14 false
  claims corrected across the 20 MODULE.md, and the ADR index no longer double-lists any decision.
- Gates: typecheck 0 · 44/44 tests, 9/9 suites · docs-lint clean (33 governed) · `conducks audit`
  confirmed. `website/` committed separately.

## Next, in order
1. **todo06 — make the layer contract true, then turn the gate on.** Ordered fix is in the todo: route
   `cli → core`/`cli → domain` through composition (61 of the 71 edges), decide the `cli → mcp`
   launcher exception, fix `pulse-worker.ts:2` (core → domain), then add the rule. Do NOT add the rule
   first.
2. **New todo needed: the three broken languages.** Probe each candidate pattern against the real
   grammar before it goes in a query file — the recipe is in `memory.md`.
3. **Decide the `upstream`/`downstream` default.** MCP defaults `downstream`; the CLI, registry and
   analyzer all default `upstream`, and `upstream` is what "what breaks if I change this" means. The
   descriptions are now honest, so this is a deliberate behaviour change, not a typo.
4. **todo11 — inheritance edges.** Still zero EXTENDS/IMPLEMENTS in the vault, re-confirmed by census.
5. Your live Claude Desktop config still points at the dead `build/index.js` from an older `setup` run
   — the code is fixed, but the existing entry needs the corrected path plus the `mcp` arg.
