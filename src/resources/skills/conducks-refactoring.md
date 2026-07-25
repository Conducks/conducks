<!-- description: Rules for structural evolution and Graph-Verified Refactoring (GVR). How to safely rename, move, and extract symbols. -->

# Refactoring Guidance

> Refactoring is the art of structural truth. If the code still works but its structure is a lie, it is tech debt.

---

## The GVR Protocol

All structural changes to the Synapse must follow the **Graph-Verified Refactoring (GVR)** protocol:

### 1. Blast Radius Analysis
Before any rename or move, run **`conducks_impact`** (CLI: `conducks impact <symbol>`).
- Identify **d1 dependencies** — affected nodes at distance 1 (will break).
- Identify **d2 dependencies** — distance 2 (likely affected).
- If the reported **Overall Risk is > 7 / 10**, do not proceed without an ADR or explicit user review of the plan.

### 2. Atomic Extraction
When extracting logic into a new module, place it by LAYER, not by convenience:
- primitives (parsing, graph, persistence, git) → `src/lib/core/<area>/`
- logic over primitives → `src/lib/domain/<area>/`
- shared interfaces/types → `src/contracts/`
- wiring → `src/registry/index.ts` only · entry points → `src/interfaces/{cli,tools,web}/`

Then update ALL d1 callers in the same turn, and run `conducks guard` (the `layer_boundaries` rule) plus **`conducks_audit`** to prove no illegal edge, cycle, or self-import was introduced.

### 3. Verification
After the refactor:
- Run `npm run type-check` (`tsc --noEmit`) — whole program, 0 errors. `npm run build` also compiles but does far more.
- Run `conducks audit` — orphans, circular dependencies, self-imports, sentinel governance rules. It exits non-zero on any violation.
- Re-run the tests covering the moved code (`npm test`, or `npm run test:unit` / `test:int`).
- Never generate a structural doc to "verify" the new shape — structure is queried, never written (ADR 0011).

---

## Rules

**REF-1 — No Partial Renames** `[severity: critical]`
Never rename a symbol in only one file. If use of the symbol is spread across the Synapse, all instances must be updated in a single, atomic commit.

**REF-2 — Downward Only** `[severity: high]`
Dependencies run downward only: `contracts <- core <- domain <- composition (src/registry/index.ts) <- interfaces {cli, tools, web}` (ADR 0005). Moving a primitive UP a layer — `src/lib/core/` into `src/lib/domain/`, or anything into `src/interfaces/` — is a violation. Primitives move DOWN (more shared), not UP (more specific). The contract is encoded as `ALLOWED_DEPENDENCIES` in `governance/sentinel-rules.ts` and ENFORCED: `layer_boundaries` is a default rule (since 2026-07-25) and `conducks guard` hard-blocks any upward edge — imports AND calls, type-only included. Two documented launcher exceptions: cli → web (mirror) and cli → mcp (server start).

**REF-3 — Document the Growth** `[severity: medium]`
If a module grows too large, split it into parts. Each part gets its own AUTHORED `docs/architecture/modules/<path mirroring src>/MODULE.md` stating **Layer / Responsibility / Boundaries / Deferred**; the parent MODULE.md becomes an overview that links to the parts and repeats nothing. Link it from `docs/architecture/README.md`. A MODULE.md is hand-written (never generated) and carries no wiring, no symbol map, and no capability catalogue — capabilities live in `features.md`, wiring stays queryable (ADR 0015).
