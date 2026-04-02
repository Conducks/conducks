<!-- description: Error taxonomy, typed error classes, logging standards, what must never be swallowed silently, and how to surface errors at each layer. -->

# Backend — Error Handling Rules

> Errors are information. Swallowing them is data loss. Logging them badly is noise.

---

## Error taxonomy

Define a typed error hierarchy. Every thrown error should be identifiable by type, not by string comparison.

```typescript
// Base class
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Specific types
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super("RESOURCE_NOT_FOUND", `${resource} with id "${id}" was not found.`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super("AUTH_UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("AUTH_FORBIDDEN", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super("VALIDATION_FAILED", "The request data is invalid.", 400, details);
  }
}
```

---

## Layer responsibilities

**Repository layer** — throw data errors only.
```typescript
// correct
if (!user) throw new NotFoundError("User", id);

// wrong — leaks DB internals
throw new Error("prisma: no record found");
```

**Service layer** — throw business rule errors. Catch and rethrow repository errors if the message needs enriching.

**Route/handler layer** — catch all `AppError` subclasses and map to the unified `ApiResponse` envelope. Let a global error handler catch anything uncaught.

---

## Error handling rules

**ERR-1 — Never swallow errors silently** `[severity: high]`
An empty `catch` block is a defect. If you catch an error and do nothing with it, you have hidden a failure. At minimum, log it.

```typescript
// banned
try {
  await doSomething();
} catch {}

// correct
try {
  await doSomething();
} catch (error) {
  logger.error("doSomething failed", { error });
  throw error; // or handle it intentionally
}
```

**ERR-2 — Catch at the boundary, not everywhere** `[severity: medium]`
Errors propagate upward naturally. Only catch at the layer where you can do something useful: transform the error, add context, or return a response to the client.

**ERR-3 — Global error handler is mandatory** `[severity: high]`
Every application must have a single, centralized error handler that catches unhandled errors and returns a `500` `ApiResponse`. No uncaught promise rejections. No unhandled exceptions.

**ERR-4 — Never expose stack traces to clients** `[severity: high]`
Stack traces, internal error messages, DB query text, and file paths must never appear in API responses. Log them server-side only.

**ERR-5 — Include correlation IDs in logs** `[severity: medium]`
Every request should have a correlation/trace ID. Include it in all log entries for that request. This is the only way to reconstruct a request's full path through the system.

---

## Logging standards

Log levels and when to use them:

| Level | When to use |
|---|---|
| `error` | A request or operation failed. Requires investigation. |
| `warn` | Something unexpected happened but the operation completed. |
| `info` | Significant lifecycle events (service started, job finished). |
| `debug` | Detailed execution trace. Disabled in production. |

**Never log in production:**
- Full request/response bodies containing PII or credentials
- Database query text with bound parameters
- Authentication tokens or API keys
- Stack traces in response bodies

**Always log at the error level:**
- Unhandled exceptions
- Failed DB transactions
- Third-party service failures
- Unauthorized access attempts