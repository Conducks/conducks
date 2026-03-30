# Conducks Skill: Governance (Architectural Laws)

Use this skill to enforce and audit the structural laws of the Conducks project. Focus on preventing circularity and maintaining layer integrity.

## 1. Local Policy Enforcement
Check for a `conventions.md` file in the repository root. Ensure that rules like `require_export` or `require_file` are defined.

## 2. Audit Violations
Call `conducks_governance(mode: 'audit')` to identify any symbols that break the repository's structural laws.
Focus on ARCH-3 (Circular Dependencies), which is the most critical violation.

## 3. Identify Root Violators
For every flagged violation, call `conducks_metrics(mode: 'explain', symbolId: <violator_id>)`.
Identify if the code is a "Monolithic Hub" that needs to be decomposed to solve the violation.

## 4. Final Compliance Report
Provide a table of all the violations found and estimate the structural risk impact.
Use `conducks_evolution(mode: 'diff')` to verify that the violation is cleared after a refactor.
