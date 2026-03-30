<!-- description: Backend layer architecture — Scale Path vs Pragmatic Path, dependency direction, domain vertical structure, and forbidden import patterns. -->

# Backend — Architecture Rules

> Every layer exists for a reason. Name it, justify it, enforce it.

---

## Path choice

**Pragmatic Path** — flat `src/` layout, no extraction layers.
Use when the service has fewer than ~3 domains and no plans for shared logic extraction. Co-locate feature code with its route or handler.

**Scale Path** — `lib/core` + `lib/product` + `src/` shell.
Use when the service is expected to grow or share logic across domains.

Document the chosen path in `architecture.md` before writing any code.

---

## Scale Path layer rules

**`lib/core/`** — domain-agnostic primitives only.
Examples: auth, db client, http client, logger, config, mailer.
- Imports from: external packages only
- Never imports from: `lib/product`, `src`

**`lib/product/[domain]/`** — domain-specific business logic.
Examples: `billing/`, `users/`, `notifications/`
- Imports from: `lib/core`, external packages
- Never imports from: `src`, sibling domains directly

**`src/`** — application shell.
Examples: route handlers, Next.js pages, server entry points, middleware.
- Imports from: `lib/product`, `lib/core`, external packages

---

## Domain vertical anatomy

Each domain folder owns everything about its domain:

```
lib/product/[domain]/
├── repository.ts     — data persistence (DB queries, ORM calls)
├── service.ts        — business logic and orchestration
├── types.ts          — domain types, interfaces, enums
├── utils/            — pure helper functions for this domain only
├── validation/       — input schemas (Zod, Yup, etc.)
├── client/           — browser hooks and client-side logic (if full-stack)
└── server/           — Node-specific adapters and integrations
```

**Cross-domain code** goes into `lib/product/_shared/`. Never import directly between two sibling domains.

---

## TypeScript type rules

**BKD-1 — No `any`** `[severity: high]`
Use `unknown` and narrow it, or define a proper interface. `any` is a defect, not a shortcut.

**BKD-2 — Domain prefix for global types** `[severity: medium]`
Types used outside their domain must be prefixed: `AuthUser`, `BillingInvoice`, `ApiError`.

**BKD-3 — Interfaces for public APIs, Types for internal composition** `[severity: medium]`
If it crosses a module boundary, use `interface`. If it's local composition, `type` is fine.

**BKD-4 — Barrel exports** `[severity: medium]`
Every domain exports via `index.ts`. External modules import from `lib/product/[domain]`, never from deep paths like `lib/product/billing/repository`.

**BKD-5 — No scattered `process.env`** `[severity: high]`
All environment access is through a config module. Define all env vars in a schema there. No `process.env.SOMETHING` in business logic, routes, or components.

---

## Forbidden import checklist

Before any import, verify:
- [ ] `lib/core` is not importing from `lib/product` or `src`
- [ ] `lib/product/[domain]` is not importing from another domain directly
- [ ] `lib/product` is not importing from `src`
- [ ] No DB client is imported directly in a route handler
- [ ] No `process.env` access outside the config module