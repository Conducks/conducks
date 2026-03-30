<!-- description: Backend and API governance. Architecture layers, data access patterns, API contracts, error handling, and TypeScript type rules. Call with tool= to get a specific guide. -->

# Backend Guidance — Index

> The backend is not the place for improvisation. Every layer has a job. Every function has one reason to exist.

Structure your service so the next engineer — or agent — can understand it from the file tree alone.

---

## Available sub-tools

| tool= | What it covers |
|---|---|
| `architecture` | Layer rules, dependency flow, Domain-Driven structure, Scale vs Pragmatic Path |
| `api` | Unified API response contract, endpoint naming, HTTP method rules, status codes |
| `data` | Repository pattern, database access rules, query hygiene, migration discipline |
| `error-handling` | Error taxonomy, typed errors, logging standards, what never to swallow silently |

---

## Core principles (always apply)

- `lib/core` never imports from `lib/product` or `src`. No exceptions.
- `lib/product` never imports from `src`. No exceptions.
- Direct DB calls from route handlers or React components are a violation.
- Every API response uses the unified envelope: `{ success, data, error }`.
- `process.env` is never accessed directly in business logic — only via a config module.
- `any` type is a defect. Use `unknown` and narrow it, or define a proper interface.