<!-- description: Security governance — authentication, secrets management, and security audit checklist. Call with tool= to get a specific guide. -->

# Security Guidance — Index

> Security is not a feature. It is a constraint that applies to every decision, from day one.

Do not defer security to "later." There is no later. Later is production.

---

## Available sub-tools

| tool= | What it covers |
|---|---|
| `audit` | Pre-ship security checklist — what to verify before any code goes to production |
| `auth` | Authentication and authorization rules — sessions, tokens, RBAC |
| `secrets` | Secrets management — env vars, rotation, what must never be committed |

---

## Core principles (always apply)

- Secrets never touch source control. Not even in commit history.
- `process.env` is accessed through a typed config module, never directly in business logic.
- Authentication is verified at the boundary. Authorization is verified in the service layer.
- User input is always treated as hostile until validated and sanitized.
- Dependencies are pinned and audited. `npm audit` runs in CI.
- Errors surfaced to clients never include stack traces, query text, or internal paths.