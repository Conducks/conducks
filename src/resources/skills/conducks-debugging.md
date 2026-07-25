<!-- description: Debugging rules for conducks. How to follow the call path, trace errors, and use the graph tools instead of guessing. -->

# Debugging Guidance

> Debugging is not a guessing game. It is a systematic walk of the call path. If you don't know where the data started, you don't know why it failed.

---

## The Debug Protocol

When a bug is reported or an error is thrown, follow this three-step protocol:

### 1. Symbol Discovery
Use **`conducks_query`** to find the symbol behind the error signature. Fuzzy search is the default; `mode: "template"` runs a named Oracle query (call it with `mode: "template"` and no `template` to list them).
- `{ "q": "parseConfig" }` — fuzzy search, `limit` defaults to 10.
- `{ "mode": "template", "template": "find_usages", "params": { "name": "parseConfig" } }`

### 2. Path Tracing
Identify the entry point and run **`conducks_trace`** (`symbol` required).
- `{ "symbol": "parseConfig" }` — walks the execution path downstream.
- `{ "symbol": "parseConfig", "target": "writeCache", "mode": "path" }` — shortest path between two symbols.
- Verify the layers are used in the right direction: `contracts` <- `core` (`src/lib/core`) <- `domain` (`src/lib/domain`) <- composition (`src/registry/index.ts`) <- interfaces (`src/interfaces/{cli,tools,web}`).
- Flag any step that violates that downward-only rule; `conducks guard` enforces it.

### 3. Root Cause Isolation
Once the broken symbol is found:
- Check its **`conducks_context`** — `{ "symbol": "parseConfig", "radius": 2 }` (`symbol` required, `radius` defaults to 2, optional `max_tokens`).
- Identify its callers (upstream) to see if the input was already corrupted.
- Identify its callees (downstream) to see the extent of the blast radius.

---

## Rules

**DEBUG-1 — No Silent Swallowing** `[severity: critical]`
Never use empty `catch` blocks. All errors must be logged to `stderr` with a traceable context prefix or re-thrown after augmentation.

**DEBUG-2 — Trace Parity** `[severity: high]`
A bug fix is not complete until a unit test reproduces the failure state. The test must follow the same call path identified during the trace.

**DEBUG-3 — Use the Tools** `[severity: medium]`
Do not start grepping the codebase until you have used `conducks_query`. The graph knows more than the text search.