# Conducks Skill: Refactoring (Structural GVR)

Use this skill to safely modify structural relationships without breaking the Conducks engine's resonance.

## 1. Deep-Metrics Analysis
Call `conducks_metrics(mode: 'explain', symbolId: <target_symbol>)` to evaluate the current complexity and risk.
Ensure the refactor target is not a "Critical Hub" for multiple system entry points.

## 2. Preview Structural Blast Radius
Call `conducks_evolution(mode: 'diff')` to identify the downstream symbols that might be impacted by the changes.
Use `conducks_trace` to verify that no execution paths are broken.

## 3. Identify Candidates
Call `conducks_governance(mode: 'refactor-candidates')` for system-generated suggestions on where to decouple or simplify.

## 4. Execution via GVR
Use `conducks_evolution(mode: 'rename')` for atomic, structural renames. This is the only safe way to rename core symbols in Conducks.
Verify with a final `conducks_analyze` pulse.
