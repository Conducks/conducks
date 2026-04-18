<!-- description: Rules for structural evolution and Graph-Verified Refactoring (GVR). How to safely rename, move, and extract symbols. -->

# Refactoring Guidance

> Refactoring is the art of structural truth. If the code still works but its structure is a lie, it is tech debt.

---

## The GVR Protocol

All structural changes to the Synapse must follow the **Graph-Verified Refactoring (GVR)** protocol:

### 1. Blast Radius Analysis
Before any rename or move, run **`synapse_impact`**.
- Identify **d1 dependencies** (Will break).
- Identify **d2 dependencies** (Likely affected).
- If the risk is **HIGH** (impact score > 15), do not proceed without an ADR or explicit user review of the plan.

### 2. Atomic Extraction
When extracting logic into a new module:
- Move the file to `lib/product/[domain]/utils.ts` or similar.
- Update ALL d1 callers in the same turn.
- Run `sentinel_audit` to ensure no circular dependencies were introduced.

### 3. Verification
After the refactor:
- Run `npm run build` to catch type errors.
- Run `blueprint_gen` to verify the new structural hierarchy matches the intent.

---

## Rules

**REF-1 — No Partial Renames** `[severity: critical]`
Never rename a symbol in only one file. If use of the symbol is spread across the Synapse, all instances must be updated in a single, atomic commit.

**REF-2 — Downward Only** `[severity: high]`
A refactor that moves a utility from `lib/core` to `src` is a violation. Primitives move DOWN (more shared), not UP (more specific).

**REF-3 — Document the Growth** `[severity: medium]`
If a domain grows too large, split it into sub-domains. Update the `architecture.md` file tree accordingly.