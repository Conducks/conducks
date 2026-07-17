# Agent 09 Audit: Interface & Static Assets (MCP Tools + Web UI)

**Scope:** `src/interfaces/tools/` (synapse.ts, kinetic.ts, server.ts, entry.ts, hypertoon.ts, index.ts) + `src/interfaces/web/mirror-server.ts` + `src/resources/mirror/` (HTML, JS, CSS)

**Date:** 2026-06-20  
**Severity Levels:** CRITICAL | HIGH | MEDIUM | LOW

---

## FINDINGS

### Type Safety & Any-casting (17 in synapse.ts, 13 in kinetic.ts)

#### ✅ ACCEPTABLE PATTERN (Not a bug)
- All `(registry.infrastructure as any)` casts are **infrastructure plumbing** accessing untyped DI container.
- All handler `({ ...unkeyedArgs }: any)` destructuring is **correct** because MCP tool arguments come as untyped JSON.
- Root cause: TypeScript's lack of structural typing for MCP SDK types. The implementation correctly acknowledges this with comments and isolates casts to known-safe access patterns.

**Verdict:** No security risk. Code matches MCP SDK patterns from ModelContextProtocol.

---

## SECURITY ISSUES FOUND

### 1. CRITICAL: Path Traversal via `customPath` Parameter

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/tools/synapse.ts:20-32` (ensureAnchor)
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/tools/kinetic.ts:18-29` (ensureAnchor)

**Description:**  
The `path: customPath` parameter in all 9 tools accepts **arbitrary filesystem paths** from the MCP client without validation. An attacker sending `"path": "../../../../../../etc"` or `"path": "/tmp/evil"` causes `registry.initialize(readOnly, root)` to re-anchor the database to an untrusted directory.

**Impact:**  
- **Multi-user environments:** One MCP client can manipulate where another client's tool calls read/write data.
- **Read-only bypass (partial):** While `readOnly=true` is set for most tools, `ensureAnchor(customPath, true)` on line 59 (kinetic.ts) and 69 (synapse.ts) doesn't verify that `customPath` is within the project workspace.
- **Data leakage:** Tools can be redirected to read arbitrary graph databases or DuckDB files.
- **Privilege escalation:** If Conducks runs with elevated privileges, registry re-initialization to `/root/.conducks/` or similar is possible.

**Evidence:**  
```typescript
// synapse.ts:20-21
const root = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
// NO VALIDATION. No path.resolve() + normalization + workspace containment check.

// kinetic.ts:237 (rename tool is MUTATIONAL)
await ensureAnchor(customPath, true); // GVR is memory-safe and FS-verified.
// BUT: customPath itself is NOT verified. readOnly=true doesn't stop path traversal.
```

**Fix Required:**  
```typescript
// Validate customPath is within workspace
const resolvedPath = path.resolve(customPath);
const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
if (!resolvedPath.startsWith(path.resolve(workspaceRoot))) {
  throw new Error("Path must be within workspace");
}
```

---

### 2. HIGH: SQL Injection via Template Parameter (Conditional)

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/tools/synapse.ts:81-84`

**Description:**  
The `conducks_query` tool accepts `template` (string) and `params` (object) without validating that `template` is a **whitelisted Oracle template name**. If `registry.analyze.query.execute(template, rawParams)` does not validate the template name internally, a client can pass arbitrary SQL:

```javascript
{ mode: "template", template: "'; DROP TABLE graph; --", params: {} }
```

**Impact:**  
- Database corruption or deletion.
- Information disclosure if attacker injects UNION-based subqueries.
- Works only if Oracle execute() doesn't whitelist. **Assumption:** It may. Verify in registry code.

**Evidence:**  
```typescript
// Line 73: Lists available templates
const templates = (registry.analyze.query as any).listTemplates();
// Line 83: Directly passes user input as template name
const results = await registry.analyze.query.execute(template as any, rawParams);
// NO enum validation, NO allowlist comparison
```

**Fix Required:**  
```typescript
const allowedTemplates = (registry.analyze.query as any).listTemplates().map(t => t.id);
if (!allowedTemplates.includes(template)) {
  throw new Error(`Unknown template: ${template}`);
}
```

---

### 3. HIGH: Unsafe `innerHTML` in Mirror UI (Potential XSS)

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/resources/mirror/ui.js:41-49` (Layer filters)
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/resources/mirror/ui.js:225-234` (Cluster filters)

**Description:**  
The code populates `innerHTML` with template literals that **include untrusted data from the server response** (`c.name`, `c.id`, `l.color`):

```javascript
item.innerHTML = `
  <span class="filter-shield-title">${c.name}</span>
  <span class="filter-shield-count">${c.count || 0}</span>
  <input type="checkbox" data-cluster="${c.id}" ...>
`;
```

If the backend API (`/api/synapse`) returns a cluster name like `<img src=x onerror="alert(1)">`, it will execute in the DOM.

**Impact:**  
- **Stored XSS:** If cluster names are persisted in the database with injected payloads.
- **Reflected XSS:** If an attacker controls the `/api/synapse` response (e.g., man-in-the-middle or compromised backend).
- Cookie theft, session hijacking, malware injection.

**Evidence:**  
```javascript
// ui.js:227
item.innerHTML = `
  <span class="filter-shield-title">${c.name}</span>  // UNTRUSTED
```

The `color` style property is also set via untrusted data:
```javascript
item.style.setProperty('--shield-color', c.color);  // CSS injection risk
```

**Fix Required:**  
Replace `innerHTML` with safe DOM APIs:
```javascript
const title = document.createElement('span');
title.className = 'filter-shield-title';
title.textContent = c.name;  // Safe: plain text, no HTML parsing

const count = document.createElement('span');
count.className = 'filter-shield-count';
count.textContent = String(c.count || 0);

item.appendChild(title);
item.appendChild(count);
```

Validate CSS color values:
```javascript
if (/^#[0-9a-f]{6}$/i.test(c.color)) {
  item.style.setProperty('--shield-color', c.color);
}
```

---

### 4. MEDIUM: Error Message Information Disclosure

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/tools/synapse.ts:111, 173, 274, 320, 360`
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/tools/kinetic.ts:77, 115, 206, 241`

**Description:**  
All error handlers return `{ error: \`${err.message}\` }`, which leaks **internal system details** to the MCP client:

```typescript
} catch (err: any) {
  return { error: `Query Failed: ${err.message}` };
}
```

If a database error occurs: `"Query Failed: DUCKDB_CATALOG_NOT_FOUND: Catalog 'public' not found in /home/user/.conducks/db"`, the response exposes:
- System path (`/home/user/`)
- Database location and structure
- Internal technology stack

**Impact:**  
- **Information gathering for targeted attacks** on the MCP server.
- Helps attackers understand the file structure and database setup.
- Violates security best practices (never leak internals to clients).

**Fix Required:**  
```typescript
catch (err: any) {
  console.error(`[DEBUG] Query failed:`, err);  // Log internally
  return { error: `Query failed. Administrator notified.` };  // Generic message
}
```

---

### 5. MEDIUM: No Input Validation for Numeric Parameters

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/web/mirror-server.ts:49-51`

**Description:**  
The `/api/synapse` endpoint parses `layers`, `spread`, and other params with `parseInt()` but doesn't validate bounds:

```javascript
const l = layers ? (layers as string).split(',').map(n => parseInt(n, 10)) : undefined;
const s = spread ? parseInt(spread as string, 10) : undefined;
```

An attacker can send:
- `layers=999999999999` → memory exhaustion
- `spread=-999999` → algorithm instability in force graph
- `layers=0,1,2,3,4,5,6,7,8,0,1,2,3,4,5,6,7,8,0,1,2,3...` (repeat) → DoS

**Impact:**  
- **Denial of Service:** Server crashes or hangs on large computations.
- **Memory leak:** Unbounded array allocations.

**Fix Required:**  
```typescript
const validateLayerId = (id: number) => id >= 0 && id <= 8;
const l = layers 
  ? (layers as string).split(',').map(n => parseInt(n, 10)).filter(validateLayerId) 
  : undefined;

const s = spread 
  ? Math.max(100, Math.min(10000, parseInt(spread as string, 10))) 
  : undefined;
```

---

### 6. MEDIUM: Unguarded Database Concurrency

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/hypertoon.ts:56-76`
- All tool handlers call `await (registry.infrastructure.persistence as any).close()` in finally block

**Description:**  
The tool wrapper closes the database connection **after every tool call**. However, if two MCP clients issue concurrent requests (e.g., client A runs `conducks_query` while client B runs `conducks_impact`), both hit `registry.initialize()` simultaneously:

1. Client A: `registry.initialize(true, pathA)` — locks DB for initialization
2. Client B: `registry.initialize(true, pathB)` — blocks, waiting for lock
3. Client A finishes, calls `.close()`
4. Client B resumes with pathB, but may have stale connection state from A's init

**Impact:**  
- **Race condition:** Both clients share the same registry instance if `ensureAnchor` logic fails to properly reset state.
- **Data corruption:** If Client A initialized with pathA and Client B with pathB, reads/writes may target wrong database.
- **Locking deadlock:** DuckDB connection pool exhaustion if `.close()` doesn't actually release.

**Fix Required:**  
Add request-scoped sessions (one DB connection per MCP request) or use explicit locking:
```typescript
const toolLock = new AsyncLock();
tool.handler = async (args: any) => {
  return toolLock.acquire('db', async () => {
    await registry.initialize(true, requestPath);
    return await originalHandler(args);
  });
};
```

---

### 7. MEDIUM: No CORS Validation (Open to All Origins)

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/tools/server.ts:248` (SSE transport)
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/web/mirror-server.ts:37`

**Description:**  
Both servers enable CORS **without restrictions**:

```typescript
app.use(cors());  // Allows ALL origins: Access-Control-Allow-Origin: *
```

An attacker's webpage (`evil.com`) can make cross-origin requests to the MCP server (if running on `localhost:3001`) and execute tools:

```javascript
// evil.com
fetch('http://localhost:3001/messages', {
  method: 'POST',
  body: JSON.stringify({ tool: 'conducks_rename', symbol: 'MyClass', newName: 'Hacked' })
})
```

**Impact:**  
- **CSRF-like attacks:** Attacker tricks users into visiting malicious page, which runs tools on their local Conducks server.
- **Privilege escalation:** If MCP server is accessible from network (not just localhost), any machine can trigger mutations.

**Fix Required:**  
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST']
}));
```

---

### 8. MEDIUM: No Authentication/Authorization on Tools

**Location:**  
- All tool handlers in `synapse.ts` and `kinetic.ts`

**Description:**  
The MCP tools have **no authentication layer**. Any client that connects to the MCP server can:
- Read the entire codebase via `conducks_query`
- Rename symbols via `conducks_rename` (mutational)
- Audit the architecture via `conducks_audit`

If the MCP server is exposed to the network (e.g., via SSE transport on `0.0.0.0:3001`), **unauthenticated remote attackers** can execute tools.

**Impact:**  
- **Complete information disclosure:** Codebase structure, hotspots, violations.
- **Code manipulation:** Rename tool modifies source files.
- **Denial of Service:** Heavy queries (archeology mode) on shared systems.

**Fix Required:**  
Implement bearer token validation:
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const authHeader = request.context?.headers?.['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.slice(7);
  if (!isValidToken(token)) throw new Error('Invalid token');
  // ... execute tool
});
```

---

### 9. MEDIUM: Node ID Injection in Hydration Endpoint

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/web/mirror-server.ts:63-72`

**Description:**  
The `/api/node/:id` endpoint accepts an arbitrary node ID via URL parameter:

```typescript
const id = decodeURIComponent(req.params.id);
const hydratedNode = await this.gateway.hydrateNode(id);
```

If the `hydrateNode()` function constructs SQL or file paths from `id` without validation, an attacker can inject:
- SQL: `id="'; DROP TABLE nodes; --"`
- Path traversal: `id="../../../etc/passwd"`

**Impact:**  
- Database corruption (if SQL-based hydration).
- Unauthorized file access (if path-based hydration).

**Fix Required:**  
Validate node ID format (should match graph symbol ID pattern):
```typescript
if (!/^[a-zA-Z0-9:_\-\.]+$/.test(id)) {
  return res.status(400).json({ error: 'Invalid node ID' });
}
```

---

### 10. LOW: SSE Broadcast Without Rate Limiting

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/web/mirror-server.ts:88-92`

**Description:**  
The `broadcastPulse()` method sends data to all connected SSE clients without rate limiting or size validation:

```typescript
public broadcastPulse(data: any) {
  this.clients.forEach(c => {
    c.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}
```

An attacker with access to `watchSynapse` can flood all clients with large payloads, causing memory exhaustion.

**Impact:**  
- **Denial of Service:** Client browsers freeze on massive SSE messages.
- **Memory leak:** Unbounded client list if disconnect handlers fail.

**Fix Required:**  
```typescript
const MAX_PULSE_SIZE = 1024 * 100;  // 100KB
const data_str = JSON.stringify(data);
if (data_str.length > MAX_PULSE_SIZE) {
  console.warn('Pulse data too large, truncating');
  return;
}
// Rate limit: max 1 pulse per 100ms
if (Date.now() - this.lastPulseTime < 100) return;
this.lastPulseTime = Date.now();
```

---

### 11. LOW: Missing Content-Type Headers on Dynamic Responses

**Location:**  
- `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/interfaces/web/mirror-server.ts:56, 68, 90`

**Description:**  
API responses use `res.json()` (which sets `Content-Type: application/json`), but custom SSE responses manually set headers without charset:

```typescript
res.setHeader('Content-Type', 'text/event-stream');
// Missing: charset=utf-8
```

**Impact:**  
- Minor encoding issues if non-ASCII symbols in node names (low risk, already mitigated by `JSON.stringify`).

**Fix Required:**  
```typescript
res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
```

---

## ANTI-PATTERNS & STYLE ISSUES

### A. Duplicated `ensureAnchor` Function

**Locations:**  
- `synapse.ts:20-33`
- `kinetic.ts:18-29`

**Issue:** Identical function defined twice. Should be extracted to shared utility.

**Fix:** Create `src/interfaces/tools/utils/anchor.ts`:
```typescript
export async function ensureAnchor(customPath?: string, readOnly: boolean = true) { ... }
```

---

### B. Inconsistent Error Handling in SSE Transport

**Location:**  
- `server.ts:252-265` (startSSE)

**Description:**  
The SSE transport creates a new transport instance on every `/sse` request but doesn't clean up the previous one. This can lead to orphaned connections.

**Fix:**  
```typescript
app.get("/sse", async (req, res) => {
  if (transport) await transport.close();  // Clean up old
  transport = new SSEServerTransport("/messages", res);
  await this.server.connect(transport);
});
```

---

### C. Missing Timeout on `/api/node/:id` Hydration

**Location:**  
- `mirror-server.ts:66`

**Description:**  
The `gateway.hydrateNode(id)` call has no timeout. If hydration hangs, the client connection blocks indefinitely.

**Fix:**  
```typescript
const hydratedNode = await Promise.race([
  this.gateway.hydrateNode(id),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
]);
```

---

## COMPLIANCE NOTES

### MCP Security Best Practices
- ✅ Uses ModelContextProtocol SDK correctly.
- ❌ **No bearer token authentication** (CRITICAL).
- ❌ **No rate limiting** on tools.
- ❌ **No audit logging** of tool invocations.
- ❌ **No request/response size limits**.

### OWASP Top 10
- **A01: Broken Access Control** — No auth, CORS open, path traversal.
- **A03: Injection** — SQL injection (template), potential node ID injection.
- **A04: Insecure Design** — No threat model for MCP clients, shared DB connection.
- **A06: Vulnerable Components** — DuckDB connection pooling not validated.
- **A07: Cross-Site Scripting (XSS)** — Unsafe innerHTML in UI.

---

## SUMMARY

| Severity | Count | Categories |
|----------|-------|-----------|
| CRITICAL | 1 | Path traversal via customPath |
| HIGH | 2 | SQL injection (template), unsafe innerHTML |
| MEDIUM | 6 | Info disclosure, validation gaps, concurrency, CORS, auth, node injection |
| LOW | 2 | Rate limiting, headers |

**Total Issues:** 11  
**Fixable:** All  
**Requires Design Review:** Authentication model, database connection pooling  

---

## NEXT STEPS (For cavecrew-builder)

1. **Immediate (Day 1):** Path traversal validation on `customPath`. Whitelist template names. Replace innerHTML with textContent.
2. **Short-term (Week 1):** Bearer token auth, error message sanitization, input validation on numeric params.
3. **Medium-term (Sprint 1):** Database connection pooling overhaul, CORS configuration, audit logging.
4. **Long-term:** Rate limiting framework, request size limits, security testing (fuzzing, CSRF).

