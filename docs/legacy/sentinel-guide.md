# Conducks — Sentinel Governance Rulebook 🛡️

Sentinel is the enforcement engine for the Conducks Synapse. It allows you to transform architectural best practices into **Mathematical Proofs** (Rules) that are automatically audited.

---

## 🏗️ 1. The `sentinel.json` Manifest
Your governance laws are defined in a simple JSON file at the root of your project.

```json
{
  "project": "Conducks Core",
  "version": "1.0.0",
  "layers": [
    { "name": "ECOSYSTEM", "rank": 0 },
    { "name": "PRODUCT",   "rank": 3 },
    { "name": "LOGIC",     "rank": 5 }
  ],
  "rules": [
    {
      "id": "ARCH-1",
      "severity": "ERROR",
      "law": "require-layer-isolation",
      "params": { "layer": "LOGIC", "allowed": ["PRODUCT", "INFRA"] }
    }
  ]
}
```

---

## ⚖️ 2. Canonical Governance Laws

### `no-circular-dependencies` (ARCH)
- **Law**: Prohibits functional cycles between modules.
- **Proof**: Scans the adjacency list for Strongly Connected Components (SCC).
- **Resonance**: Prevents "Spaghetti Code" and ensures clean testing.

### `require-conducks-component` (STRUCT)
- **Law**: Every functional class must implement the `ConducksComponent` interface.
- **Proof**: Verifies heritage edges (implements/extends) during induction.
- **Resonance**: Ensures 100% plug-and-play compatibility.

### `limit-module-gravity` (KINETIC)
- **Law**: No single module can have a Gravity score > 0.8.
- **Proof**: Calculates in-degree centrality of the module unit.
- **Resonance**: Automatically identifies and flags "God Objects" before they become unmanageable.

---

## 🚀 3. Professional Auditing

### Running the Audit
Execute `conducks audit` to verify your project's integrity.

- **✅ Success**: "Project Resonance is at 100%. No structural sins detected."
- **❌ Violation**: Returns the exact **Sin Path** (e.g. `src/a.ts` -> `src/b.ts` -> `src/a.ts`).

### Continuous Governance (CI/CD)
The Sentinel state can be used as a "Build Gate" in your CI/CD pipeline using the `conducks guard` command.

> [!IMPORTANT]
> A project without a `sentinel.json` is a project without an architectural compass. Always bootstrap your governance before scaling.
