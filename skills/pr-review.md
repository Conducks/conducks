# Conducks Skill: PR Review (Structural Delta)

Use this skill to perform a high-fidelity structural audit of incoming changes. Focus on architectural drift and risk propagation.

## 1. Get Structural Delta
Call `conducks_evolution(mode: 'diff')` to identify added/removed nodes and edges. Look for unexpected additions that increase coupling.

## 2. Deep-dive on High-Risk Symbols
For any symbol identified with high risk or gravity in the delta, call `conducks_metrics(mode: 'explain', symbolId: <symbol_id>)`.
Verify if the risk increase is justified by the functionality or if it represents technical debt.

## 3. Audit Architectural Integrity
Call `conducks_governance(mode: 'audit')` to check for new violations triggered by the PR (e.g., circular dependencies).

## 4. Final Structural Report
Summarize your findings:
- **New Cycles**: List any circular dependencies introduced.
- **Blast Radius**: Report the downstream impact of modified core symbols.
- **Violation Delta**: Compare current violations against the base repository state.
