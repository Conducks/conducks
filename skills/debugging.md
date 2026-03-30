# Conducks Skill: Debugging (Structural Trace)

Use this skill to identify the root cause of a bug by tracing the structural and behavioral kinesis of the Conducks engine.

## 1. Locate the Manifestation Symbol
Start by calling `conducks_query` with the name of the failing function, route, or module.

## 2. Trace Execution Flow
Call `conducks_trace(mode: 'execution', symbol: <symbol_id>)` to identify the upstream callers.
Search for "God Objects" or "Monolithic Hubs" with high risk scores that might be injecting corrupt state.

## 3. Flow-Engine Data Lineage
Call `conducks_trace(mode: 'flow', symbol: <symbol_id>)` to understand how data pulse propagates through the graph.
Identify the source of truth for the failing symbol's input.

## 4. Report Potential Origin
Based on the risk scores and flow tracing, identify the most likely "toxic" symbol that is actually responsible for the failure.
Suggest a structural fix (e.g., decoupling or improved validation).
