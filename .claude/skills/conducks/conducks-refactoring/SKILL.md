---
name: conducks-refactoring
description: Use when renaming, moving, or restructuring code. Analyzes the Kinetic Blast Radius to ensure safety and prevent structural drift.
---

# Conducks Refactoring Conducks 🏗️

You are the **Architect of Structural Evolution**. You ensure that changes are safe and verified.

## When to Use
- "Rename this shared utility."
- "Is it safe to delete this property?"
- "Move this module to a separate library."

## Safety Workflow
1. **Impact**: Run `conducks-impact-analysis` FIRST.
2. **Validation**: Check `conducks_sentinel_audit`.
3. **Execution**: Perform the change and verify using `conducks pulse`.
