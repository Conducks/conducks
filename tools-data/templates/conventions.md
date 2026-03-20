<!-- @format -->

# Conventions — [Service Name]

<!-- Non-negotiable rules for this service.
     Agent: append to "Agent-detected" when you notice a pattern or implicit rule.
     User: define rules anywhere in this file at any time.
     Every rule needs an ID, a clear statement, and the reason it exists.
     No reason = the rule will be ignored or worked around. -->

---

## Import rules

Rules about which modules may import from which. These protect the architecture from circular dependencies and layer violations.

| Rule ID | Statement | Reason |
|---|---|---|
| IMP-01 | `[folder A]` must not import from `[folder B]` | [why — what breaks if this is violated] |
| IMP-02 | `[folder A]` may only import from `[folder B]` or `[folder C]` | [why] |

---

## Naming rules

| Rule ID | Applies to | Rule | Reason |
|---|---|---|---|
| NAM-01 | [files / functions / variables / types] | [rule statement] | [why] |

---

## Code rules

| Rule ID | Rule | Reason |
|---|---|---|
| COD-01 | [rule statement] | [why] |

---

## Doc rules

| Rule ID | Rule | Reason |
|---|---|---|
| DOC-01 | [rule statement] | [why] |

---

## Agent-detected patterns

<!-- Agent appends here when noticing a recurring pattern or implicit rule not yet formalized.
     Flag each addition to the user: "I noticed a pattern — added to conventions.md for your review." -->

| Detected | Pattern or violation observed | Proposed rule |
|---|---|---|
| [YYYY-MM-DD] | [what was noticed in the codebase] | [suggested rule text] |
