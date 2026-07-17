# A3 — Populate domain.ts with shared domain types

**Agent:** A3 (agent-04)
**Wave:** 6
**Date:** 2026-06-21
**Task:** Define 5 canonical domain types in `src/types/domain.ts`

## Status: COMPLETE

## What was done

Populated `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/types/domain.ts` with 5 new canonical type definitions alongside the pre-existing `Advice` type.

### Types added

| Type | Derived from |
|---|---|
| `SynapseNode` | `ConducksNode` in `src/lib/core/graph/adjacency-list.ts` |
| `SynapseEdge` | `ConducksEdge` in `src/lib/core/graph/adjacency-list.ts` |
| `Pulse` | `SynapsePersistence` schema + graph engine metadata |
| `KineticResult` | `BlastRadiusAnalyzer.analyzeImpact` return shape |
| `ResonanceScore` | `ResonanceAnalyzer.analyzeResonance` return shape |

## Key findings

- `SynapseNode` / `SynapseEdge` were not previously named — the canonical types were `ConducksNode` / `ConducksEdge` in the graph layer. Domain types are stable aliases with `[key: string]: any` on properties to allow extension without breakage.
- `Pulse` was an implicit runtime concept (DuckDB row + graph metadata); no interface existed. Defined from the `saveGraph` and schema columns in `persistence.ts`.
- `KineticResult` and `ResonanceScore` were anonymous inline return types from `analyzeImpact` and `analyzeResonance`. Shapes were extracted verbatim from those methods.
- `KineticResult.affectedNodes[].path` is `string[]` (edge type names), not `ConducksEdge[]` — matches the `.map(e => e.type)` projection in impact.ts.

## Verification

`npx tsc --noEmit` — 0 errors, 0 warnings.

## What was NOT done (by design)

- Callers were not migrated to use the new types (out of scope for A3).
- `ConducksNode` / `ConducksEdge` in adjacency-list.ts were not modified.
- No imports were added to existing files.
