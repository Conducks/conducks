# Agent 04: Persistence & Registry Audit

**Date:** 2026-06-20  
**Scope:** Persistence layer, Registry infrastructure, Bootstrap & Utils  
**Status:** READ-ONLY audit complete. 7 CRITICAL, 5 HIGH, 3 MEDIUM issues found.

---

## Critical Issues

### 1. SQL Injection via String Interpolation in purgeUnits()

**Location:** `src/lib/core/persistence/persistence.ts:234-244`

```typescript
const ids = unitIds.map(id => `'${id.toLowerCase()}'`).join(',');
await this.run(`DELETE FROM nodes WHERE unitId IN (${ids})`);
await this.run(`DELETE FROM edges WHERE sourceId IN (SELECT id FROM nodes WHERE unitId IN (${ids}))`);
```

**SEVERITY:** CRITICAL (Data Corruption Risk)

**Exploitability:** HIGH. Any caller passing malicious unitIds can break the SQL string:
- Input: `"' OR '1'='1"`
- Result SQL: `DELETE FROM nodes WHERE unitId IN (''\'` OR '1'='1', ...)`
- **Impact:** Entire nodes/edges table can be wiped.

**Root Cause:** String interpolation instead of parameterized queries. The `run()` method accepts params array but purgeUnits concatenates IDs directly.

**Fix Required:** Use parameterized queries:
```typescript
const placeholders = unitIds.map(() => '?').join(',');
await this.run(`DELETE FROM nodes WHERE unitId IN (${placeholders})`, unitIds.map(id => id.toLowerCase()));
```

---

### 2. Broken Singleton Pattern - getInstance() Ignores vaultPath Parameter

**Location:** `src/lib/core/persistence/persistence.ts:26-31`

```typescript
public static getInstance(vaultPath: string): SynapsePersistence {
  if (!SynapsePersistence.instance) {
    SynapsePersistence.instance = new SynapsePersistence(vaultPath);
  }
  return SynapsePersistence.instance;
}
```

**SEVERITY:** CRITICAL (Silent Data Mixing)

**Issue:** On first call with vaultPath A, creates instance. On second call with vaultPath B, **returns instance A** — vaultPath B is ignored silently.

**Impact:** Multi-vault scenarios (e.g., workspace switching, multi-tenant) will corrupt data by reading/writing to wrong database. No error raised.

**Example Failure Path:**
1. Code calls `getInstance('/vault1')` → creates SynapsePersistence with `.conducks/conducks-synapse.db` at /vault1
2. Later: `getInstance('/vault2')` → **returns /vault1 instance**, ignores /vault2
3. All operations hit wrong database

**Fix Required:** Either:
- Remove singleton, use direct instantiation with dependency injection (registry already does this)
- OR add parameter validation: throw if vaultPath != current instance's vaultPath

---

### 3. Async Executor Anti-Pattern - Swallowed Errors in Promise Constructor

**Location:** `src/lib/core/persistence/persistence.ts:180, 215, 283, 303`

```typescript
return new Promise(async (resolve, reject) => {
  try {
    // BEGIN TRANSACTION
    // ... work ...
    // COMMIT
    resolve();
  } catch (err) {
    reject(err);
  }
});
```

**SEVERITY:** CRITICAL (Silent Error Swallowing)

**Issue:** Async function passed to Promise constructor. If the async function throws **before** try-catch:
- Unhandled rejection (Promise executor itself fails)
- Error is swallowed, callers never receive rejection
- Database may be left in inconsistent state (partial transaction)

**Example:**
```typescript
await saveNodes([...], pulseId); // If db.prepare() fails before try block, rejection is lost
```

**Lines Affected:**
- `saveNodes()` line 180
- `saveEdges()` line 215
- `updateRanks()` line 283
- `updateEdgeTargets()` line 303

**Fix Required:** Remove async from executor:
```typescript
return new Promise((resolve, reject) => {
  (async () => {
    try { ... } catch(e) { reject(e); }
  })();
});
// OR
async function doWork() { ... }
doWork().then(resolve).catch(reject);
```

---

### 4. Missing ROLLBACK on Transaction Failure

**Location:** `src/lib/core/persistence/persistence.ts:177-210, 212-232, 280-298, 300-318`

**All Transaction Methods:**
- `saveNodes()` — lines 182-204
- `saveEdges()` — lines 217-226
- `updateRanks()` — lines 286-292
- `updateEdgeTargets()` — lines 306-312

```typescript
await this.run("BEGIN TRANSACTION");
// ... insert/update statements ...
if (ERROR) {
  reject(err); // Transaction left OPEN
}
await this.run("COMMIT");
```

**SEVERITY:** CRITICAL (Data Consistency)

**Issue:** If any statement fails mid-transaction, catch block calls `reject(err)` **without rolling back**. Database holds locks, subsequent operations fail, data corruption possible.

**Lock Behavior:** DuckDB maintains transaction isolation. Incomplete transaction may lock table for other processes.

**Fix Required:** Add ROLLBACK in catch:
```typescript
} catch (err) {
  try {
    await this.run("ROLLBACK");
  } catch (rollbackErr) {
    logger.error("Rollback failed:", rollbackErr);
  }
  reject(err);
}
```

---

### 5. Unused Database Connection After ensureVaultOpen()

**Location:** `src/lib/core/persistence/persistence.ts:135, 179, 214, 236, 248, 267, 274, 282, 302`

**Instances (Unused `db` Variable):**
- Line 135: `load()` — db assigned, never used. All queries go through `this.query()`
- Line 248: `save()` — db assigned, never used. Uses `this.run()`
- Line 267: `run()` — db used correctly ✓
- Line 274: `query()` — db used correctly ✓

**SEVERITY:** CRITICAL (Deadlock Risk)

**Issue:** `ensureVaultOpen()` obtains database connection asynchronously. If the method caches the connection in `this.db`, then unused local `db` variable in `load()` and `save()` can cause subtle deadlock or resource exhaustion.

**Actual Problem:** Looking at `ensureVaultOpen()`:
```typescript
private async ensureVaultOpen(): Promise<any> {
  if (this.db) return this.db;
  const db = new duckdb.Database(...);
  this.db = db;
  return db;
}
```

In `load()` at line 135:
```typescript
const db = await this.ensureVaultOpen(); // Gets this.db
// Later: this.query() also calls ensureVaultOpen() → returns same this.db
// OK, but confusing and error-prone
```

**Actual Issue:** If future code tries to use the local `db` instead of `this` methods, it will work differently.

**Fix:** Remove unused variables or use them consistently.

---

### 6. Broken Registry Initialization - Missing updateIgnoreManager Sync

**Location:** `src/registry/index.ts:110-140`

```typescript
export async function initializeRegistry(readOnly: boolean = true, root?: string, lazy: boolean = readOnly) {
  await bootstrapper.initialize(..., {
    updateIgnoreManager: (i) => { 
      ignoreManager = i;
      (orchestrator as any).ignoreManager = i; // Only orchestrator updated
    }
  });
  
  // But search, intelligence, federation NOT updated
  federation = new FederatedLinker(effectiveRoot); // ✓ Recreated
  search = new ConducksSearch(graph.getGraph());     // ✓ Recreated
  intelligence = new IntelligenceService(graph, search, gql, federation); // ✓ Recreated
}
```

**SEVERITY:** CRITICAL (Silent Data Inconsistency)

**Issue:** When ignoreManager is updated, only `orchestrator` receives the new instance. But other services (microPulse, analysis, evolution, governance) may hold stale ignoreManager references that are not updated.

**Impact:** File ignore patterns will be inconsistent across analysis modules. Renamed/moved files may not be properly tracked.

**Lines Affected:**
- Line 128-131: updateIgnoreManager callback only updates orchestrator
- microPulse, analysis, evolution, governance may have stale ignoreManager

**Fix:** Extend updateIgnoreManager callback:
```typescript
updateIgnoreManager: (i) => { 
  ignoreManager = i;
  (orchestrator as any).ignoreManager = i;
  microPulse?.setIgnoreManager?.(i);
  analysis?.setIgnoreManager?.(i);
  evolution?.setIgnoreManager?.(i);
  governance?.setIgnoreManager?.(i);
}
```

---

### 7. Multi-Process DuckDB Lock Conflict Not Handled

**Location:** `src/lib/core/persistence/persistence.ts:41-62` (ensureVaultOpen)

```typescript
private async ensureVaultOpen(): Promise<any> {
  const dbPath = path.join(vaultDir, 'conducks-synapse.db');
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(dbPath, { access_mode: this.readOnly ? 'READ_ONLY' : 'READ_WRITE' }, (err) => {
      if (err) {
        logger.error(`Could not anchor synapse at ${dbPath}. Vault may be locked or busy.`, err);
        return reject(err);
      }
      // ...
    });
  });
}
```

**SEVERITY:** CRITICAL (Process Crash Risk)

**Issue:** DuckDB enforces single-writer, multi-reader model. If:
1. Process A opens in READ_WRITE
2. Process B tries to open same DB in READ_WRITE → locks database
3. No retry logic, no wait, just fails immediately

**Observed Behavior:** First error call logs message, rejection propagates. No backoff.

**Impact:** In workspace with multiple analysis processes:
- Hot reloads, parallel tests, or concurrent MCP calls will crash
- No recovery mechanism
- User sees cryptic "Vault may be locked" error

**Missing:** Exponential backoff + retry (e.g., 3 retries, 100ms-1000ms delay)

**Fix:** Add retry logic:
```typescript
const maxRetries = 3;
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    return await openDatabase(...);
  } catch (err) {
    if (attempt < maxRetries - 1) {
      await sleep(Math.pow(2, attempt) * 100);
    } else {
      throw err;
    }
  }
}
```

---

## High-Severity Issues

### H1. Missing Transaction Rollback in purgeUnits()

**Location:** `src/lib/core/persistence/persistence.ts:240-243`

**Issue:** No try-catch around transaction. If DELETE fails, transaction hangs open.

```typescript
await this.run(`BEGIN TRANSACTION`);
await this.run(`DELETE FROM nodes WHERE unitId IN (${ids})`); // If fails, no ROLLBACK
await this.run(`DELETE FROM edges WHERE sourceId IN (...)`);
await this.run(`COMMIT`);
```

**SEVERITY:** HIGH

---

### H2. JSON.parse() Without Error Handling

**Location:** `src/lib/core/persistence/persistence.ts:145, 157-159, 172, 336`

```typescript
...JSON.parse(row.metadata),                // Can throw SyntaxError
kinetic: JSON.parse(row.kinetic || '{}'),   // If row.kinetic is malformed
```

**SEVERITY:** HIGH (Crash on corrupted data)

**Impact:** Single bad JSON blob in database crashes entire `load()` or `fetchNodeDeep()` operation.

**Fix:** Wrap in try-catch with fallback:
```typescript
try {
  return JSON.parse(row.metadata || '{}');
} catch (e) {
  logger.warn(`Invalid JSON in metadata for node ${row.id}`, e);
  return {};
}
```

---

### H3. Unused `db` Variable in load() and save()

**Location:** `src/lib/core/persistence/persistence.ts:135, 248`

**Issue:** Variable assigned but never used. Suggests incomplete refactoring or misunderstanding of API.

```typescript
public async load(graph: any): Promise<void> {
  const db = await this.ensureVaultOpen(); // Assigned but never used
  const nodes = await this.query("SELECT * FROM nodes"); // Uses this.query()
```

**SEVERITY:** HIGH (Code smell, maintainability)

---

### H4. console.error() Used for Non-Error Informational Messages

**Location:** `src/lib/core/registry-bootstrapper.ts:133, 148, 159, 183, 186, 196, 199`

```typescript
console.error(`🛡️ [Conducks Bootstrapper] Initializing Native Grammar Engine...`);
console.error(`🛡️ [Conducks Bootstrapper] Native Grammar Engine Ready.`);
console.error(`🛡️ [Conducks Bootstrapper] Anchoring structural synapse at: ${effectiveRoot}`);
```

**SEVERITY:** HIGH (Logging Anti-Pattern)

**Issue:** Informational messages logged to stderr via console.error(). This:
- Confuses monitoring systems (false error alerts)
- Breaks MCP stdout stream protocol
- Makes log parsing difficult

**Expected:** Use `logger.info()` for non-errors.

**Fix:** Replace all `console.error()` with `logger.info()` or `logger.debug()`.

---

### H5. getInstance() Called in Code But Singleton Not Properly Used

**Location:** `src/lib/core/persistence/persistence.ts:26-31` + usage sites

**Issue:** `getInstance()` exists but the codebase does not use it. Instead, direct instantiation:
```typescript
// src/registry/index.ts line 54
let persistence: SynapsePersistence = new SynapsePersistence(":memory:", true);
// src/lib/core/registry-bootstrapper.ts line 173
const newPersistence = new SynapsePersistence(effectiveRoot, readOnly);
```

**SEVERITY:** HIGH (Unused API creates confusion)

**Impact:** getInstance() is a code smell (singleton anti-pattern). If removed, vaultPath param becomes moot. Or if kept, callers might use it incorrectly.

---

## Medium-Severity Issues

### M1. Async Function in Promise Constructor Without Proper Error Boundary

**Location:** All Promise(async...) instances — lines 180, 215, 283, 303

**Details:** While try-catch is present, the pattern is error-prone:
- Constructor failure before try → swallowed
- Future maintainers might move code outside try
- Anti-pattern per Node.js best practices

**SEVERITY:** MEDIUM (Code quality)

---

### M2. Type Coercion in SQL Parameters

**Location:** `src/lib/core/persistence/persistence.ts:195-199, 221`

```typescript
m.range?.start.line || 0,  // Coerces undefined to 0, might hide bugs
m.depth || 0,
n.complexity || m.complexity || 1,
```

**SEVERITY:** MEDIUM

**Issue:** If range is missing, silently defaults to 0 instead of NULL. Makes debugging harder.

**Fix:** Explicitly pass NULL:
```typescript
m.range?.start.line ?? null,
```

---

### M3. Missing Error Context in Transaction Catch Blocks

**Location:** `src/lib/core/persistence/persistence.ts:206, 228, 294, 314`

```typescript
} catch (err) {
  reject(err); // No logging, no context
}
```

**SEVERITY:** MEDIUM

**Issue:** Errors rejected without logging. Caller gets rejection but operator has no visibility into root cause.

**Fix:** Log before rejecting:
```typescript
} catch (err) {
  logger.error(`saveNodes transaction failed:`, err);
  reject(err);
}
```

---

## Additional Issues Found

### A1. Race Condition: Incomplete Connection Initialization

**Location:** `src/lib/core/persistence/persistence.ts:41-62`

**Issue:** Between `new duckdb.Database()` call and callback execution, multiple concurrent calls to `ensureVaultOpen()` can create duplicate connections.

```typescript
private async ensureVaultOpen(): Promise<any> {
  if (this.db) return this.db;
  
  // Race window here: Two concurrent calls both see this.db === null
  const db = new duckdb.Database(dbPath, { ... }, (err) => {
    if (err) reject(err);
    this.db = db; // Assigned AFTER creation
    resolve(db);
  });
}
```

**SEVERITY:** MEDIUM (Resource leak)

**Fix:** Use a lock or pending promise:
```typescript
private dbPromise: Promise<any> | null = null;
private async ensureVaultOpen(): Promise<any> {
  if (this.db) return this.db;
  if (this.dbPromise) return this.dbPromise;
  
  this.dbPromise = new Promise((resolve, reject) => {
    // ... db creation ...
  });
  return this.dbPromise;
}
```

---

### A2. Hardcoded ':memory:' Initial Persistence

**Location:** `src/registry/index.ts:54`

```typescript
let persistence: SynapsePersistence = new SynapsePersistence(":memory:", true);
```

**SEVERITY:** MEDIUM

**Issue:** Persistence initialized in read-only mode with :memory: database (ephemeral). If `initializeRegistry()` never called or fails silently, all data operations hit :memory: instead of real vault.

**Symptom:** Graph loaded from memory, all changes lost on process exit.

---

### A3. No Validation of unitIds Before String Interpolation

**Location:** `src/lib/core/persistence/persistence.ts:237-238`

```typescript
const ids = unitIds.map(id => `'${id.toLowerCase()}'`).join(',');
if (!ids) return; // Check comes AFTER string creation
```

**SEVERITY:** MEDIUM

**Issue:** Empty unitIds array creates empty string, function silently returns without error. Unclear if this is intentional.

---

### A4. Hardcoded Index Creation Without Verification

**Location:** `src/lib/core/persistence/persistence.ts:129-131`

```typescript
await run(`CREATE INDEX IF NOT EXISTS idx_nodes_id ON nodes(id);`);
await run(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(sourceId);`);
await run(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(targetId);`);
```

**SEVERITY:** LOW-MEDIUM

**Issue:** Indexes created on every `initializeSchema()` call but "IF NOT EXISTS" masks errors. If index creation fails partway through, subsequent queries slow dramatically but no alert.

---

## Summary Table

| ID | File | Line | Severity | Issue | Impact |
|---|---|---|---|---|---|
| C1 | persistence.ts | 237-242 | CRITICAL | SQL injection in purgeUnits | Data wipe |
| C2 | persistence.ts | 26-31 | CRITICAL | Broken singleton (ignores vaultPath param) | Data mixing |
| C3 | persistence.ts | 180,215,283,303 | CRITICAL | Async executor swallows errors | Silent failures |
| C4 | persistence.ts | 182-204 + 217-226 + 286-292 + 306-312 | CRITICAL | Missing ROLLBACK on error | Lock contention, corruption |
| C5 | persistence.ts | 135,248 | CRITICAL | Unused db variable (deadlock risk) | Resource exhaustion |
| C6 | index.ts | 128-131 | CRITICAL | Broken ignoreManager sync across services | Data inconsistency |
| C7 | persistence.ts | 41-62 | CRITICAL | DuckDB multi-process lock not handled | Process crashes |
| H1 | persistence.ts | 240-243 | HIGH | purgeUnits missing ROLLBACK | Lock hang |
| H2 | persistence.ts | 145,157-159,172,336 | HIGH | JSON.parse without error handling | Crash on bad data |
| H3 | persistence.ts | 135,248 | HIGH | Unused db variables (code smell) | Maintainability |
| H4 | registry-bootstrapper.ts | 133,148,159,183,186,196,199 | HIGH | console.error for non-errors | Log spam, MCP breach |
| H5 | persistence.ts | 26-31 | HIGH | getInstance() not used | Confusion |
| M1 | persistence.ts | 180,215,283,303 | MEDIUM | Anti-pattern Promise(async...) | Error boundary weak |
| M2 | persistence.ts | 195-199,221 | MEDIUM | Type coercion in SQL | Debug difficulty |
| M3 | persistence.ts | 206,228,294,314 | MEDIUM | Missing error logging in catch | Operator blind |
| A1 | persistence.ts | 41-62 | MEDIUM | Race condition in ensureVaultOpen | Resource leak |
| A2 | index.ts | 54 | MEDIUM | Hardcoded :memory: initial persistence | Ephemeral data |
| A3 | persistence.ts | 237-238 | MEDIUM | No validation of unitIds | Silent return |
| A4 | persistence.ts | 129-131 | LOW | Hardcoded index creation | Slow queries if fails |

---

## Total Findings

- **Critical:** 7 issues (data loss, injection, deadlock, crash risk)
- **High:** 5 issues (corruption, logging, API confusion)
- **Medium:** 4 issues (race, hardcoding, error context)
- **Low:** 1 issue (schema)

**Critical fixes required before production use.**
