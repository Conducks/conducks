# Structure Guide

> Structure is a decision, not a default. Every layer exists for a reason. If you cannot explain why a file lives where it does, it is in the wrong place.

---

## Path choice

Before starting any new service or feature, choose a path and document it in `architecture.md`.

**Pragmatic Path** — for small, self-contained services with no planned extraction.
- Flat `src/` layout
- No `lib/core` or `lib/product` layers
- Co-locate feature code with its route or component
- Acceptable until the service has more than ~3 domains

**Scale Path** — for services expected to grow or share logic across domains.
- `lib/core/` for domain-agnostic primitives (auth, db, http, logging)
- `lib/product/` for domain-specific logic grouped by vertical
- `src/` for the application shell only (routes, entry points, config)
- Strict downward dependency: `src` → `lib/product` → `lib/core`

---

## Rules

**ARCH-1 — Document the Path** `[severity: high]`
Record which path was chosen in `architecture.md` and why. If the choice changes, append an entry explaining the migration — do not silently rewrite the decision.

**ARCH-2 — Scale Path Layers are Mandatory** `[severity: high]`
If the Scale Path is chosen, `lib/core` and `lib/product` are not optional. Shared logic that bypasses these layers and lives directly in `src/` is a violation. Refactor it.

**ARCH-3 — Strict Downward Flow** `[severity: high]`
Dependencies flow downward only: `src` may import from `lib/product` and `lib/core`. `lib/product` may import from `lib/core`. `lib/core` imports from nothing in the project. Any upward import is a circular dependency waiting to happen — fix it immediately.

**ARCH-4 — Every File in the Tree** `[severity: high]`
`architecture.md` must contain a file tree that lists every file and folder with a one-line description. If a file exists that is not in the tree, the architecture doc is wrong. Update it during execute phase.

**ARCH-5 — Feature Verticals** `[severity: medium]`
In Scale Path, features live in `lib/product/[domain]/`. Each domain owns its own data access, business logic, and types. Cross-domain imports go through `lib/core` — never directly between domains.

**ARCH-6 — Conventions Own the Import Rules** `[severity: high]`
Forbidden import paths are defined in `conventions.md`, not here. This document defines the intent of the layering. `conventions.md` defines the specific enforced rules. Both must be consistent with each other.

**ARCH-7 — i18n is Optional** `[severity: medium]`
Do not set up locale-based routing or i18n infrastructure unless the user explicitly asks for it. If needed, all locale files go in `src/i18n/messages/`. Ask first — never assume a project needs multiple languages.

**ARCH-8 — Refactor Has its Own Task** `[severity: medium]`
If you identify architectural debt during execution, log it in the parking lot of `todo.md`. Do not refactor mid-task without an explicit plan entry and user awareness. Unrequested refactors break the minimal-impact rule and create unreviewed scope.