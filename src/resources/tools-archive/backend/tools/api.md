<!-- description: API contract — unified response envelope, endpoint naming conventions, HTTP method rules, and status code standards. -->

# Backend — API Contract

> Every internal service must respond in exactly this shape. No surprises, no custom envelopes.

---

## Unified response envelope

All API responses — success or failure — use this structure:

```typescript
interface ApiResponse<T = null> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}

interface ApiError {
  code: string;       // machine-readable, e.g. AUTH_UNAUTHORIZED
  message: string;    // human-readable, safe to display
  details?: unknown;  // optional, for validation errors or debug info
}
```

**Success response:**
```json
{
  "success": true,
  "data": { "id": "usr_123", "email": "user@example.com" },
  "error": null
}
```

**Error response:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AUTH_UNAUTHORIZED",
    "message": "You must be signed in to access this resource."
  }
}
```

---

## Error codes

Error codes are `SCREAMING_SNAKE_CASE` and prefixed with the domain:

| Domain | Example codes |
|---|---|
| Auth | `AUTH_UNAUTHORIZED`, `AUTH_TOKEN_EXPIRED`, `AUTH_FORBIDDEN` |
| Validation | `VALIDATION_FAILED`, `VALIDATION_MISSING_FIELD` |
| Resource | `RESOURCE_NOT_FOUND`, `RESOURCE_CONFLICT` |
| System | `SYSTEM_ERROR`, `SYSTEM_UNAVAILABLE` |

Never use numeric codes as the primary identifier. The string code is the contract.

---

## Endpoint naming

**REST conventions:**
- Collections: `/users`, `/invoices`, `/posts`
- Single resource: `/users/:id`, `/invoices/:id`
- Actions on a resource: `/users/:id/activate`, `/invoices/:id/send`
- Nested resources (max one level): `/users/:id/invoices`

**Rules:**
- All lowercase, hyphenated: `/billing-accounts`, not `/billingAccounts`
- Nouns, not verbs: `/users/:id/activate`, not `/activateUser/:id`
- No trailing slashes
- Version prefix for public APIs: `/v1/users`

---

## HTTP method rules

| Method | When to use | Notes |
|---|---|---|
| `GET` | Retrieve a resource or collection | Must be idempotent. No side effects. |
| `POST` | Create a resource or trigger an action | Returns the created resource or action result |
| `PATCH` | Partial update | Only the fields provided are changed |
| `PUT` | Full replacement | Replaces the entire resource |
| `DELETE` | Remove a resource | Returns `204 No Content` on success |

Never use `GET` for operations that have side effects. Never use `POST` when `PATCH` is more accurate.

---

## Status code standards

| Code | Meaning | When to use |
|---|---|---|
| `200` | OK | Successful GET, PATCH, PUT |
| `201` | Created | Successful POST that creates a resource |
| `204` | No Content | Successful DELETE |
| `400` | Bad Request | Client sent invalid data (validation failure) |
| `401` | Unauthorized | Not authenticated |
| `403` | Forbidden | Authenticated but not allowed |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Resource already exists, or state conflict |
| `422` | Unprocessable | Semantically invalid (passes schema but fails business rules) |
| `500` | Server Error | Unexpected system failure |

Return the most specific code available. `400` is not a catch-all for every client error.