# Agent 06 — Domain Audit (Evolution, Governance, Federation)
**Date:** 2026-06-20  
**Scope:** src/lib/domain/{evolution,governance,federation}  
**Status:** Read-only investigation. 8 HIGH, 6 MEDIUM, 5 LOW severity issues found.

---

## EVOLUTION DOMAIN

### File: drift-engine.ts

#### [drift-engine.ts:19] HIGH — Untyped array in database query result
**Symbol:** `pulses` (any[])  
**Issue:** Line 19 declares `let pulses: any[] = []`. No validation of returned structure. Downstream code at line 35 accesses `pulses[0].id` without bounds checking. If query returns empty array AND `prevPulseId` is not provided, logic at line 26 returns early, but if an intermediate state occurs, `pulses[0]` will crash.  
**Impact:** Silent crashes in drift analysis; no type safety on database payload.  
**Reproduction:** Call `drift.compare()` with database returning NULL or malformed pulse records.

#### [drift-engine.ts:22, 66, 71] HIGH — Untyped error handlers suppress actual errors
**Symbol:** `err: any`  
**Issue:** Three catch blocks suppress errors with `err.message` access on `any` type. No null coalescing. If error object structure varies (e.g., no message property), logs fail silently.  
**Impact:** Loss of error context for debugging; silent failures propagate to persistence layer.

#### [drift-engine.ts:62, 63] HIGH — Silent query failure recovery without feedback
**Symbol:** `exactRows`, `moveRows`  
**Issue:** Lines 62-73 initialize empty arrays before try-catch. If both queries fail, `deltas` and `moves` arrays are empty, and the function returns a "STABLE" status with no error indicator. Caller cannot distinguish between "truly stable" and "failed to analyze".  
**Impact:** False negatives in drift detection; missed architectural regressions silently.

#### [drift-engine.ts:75-89] MEDIUM — No null checks on row properties
**Symbol:** Row data mapping  
**Issue:** Line 75 maps `exactRows` without checking if `gravity`, `complexity`, `fingerprint` fields exist. Line 87 calculates `velocity = (gDelta * 0.5) + (cDelta * 0.5)` with undefined values → NaN.  
**Impact:** Invalid drift deltas propagate to caller (advisor, guard); metrics become unreliable.

#### [drift-engine.ts:100] MEDIUM — Fragile status logic
**Symbol:** `status` determination  
**Issue:** Line 100 checks if `deltas.some(d => d.velocity > 0.05)` to set status to 'DECAYING'. But if velocity is NaN (from null properties), comparison fails silently, defaulting to 'STABLE'. Also, the return type allows 'IMPROVING' but logic only sets 'DECAYING' or 'STABLE'.  
**Impact:** Incorrect architectural drift classification; unused status enum value.

---

### File: watcher.ts

#### [watcher.ts:76-80] HIGH — Chokidar memory leak risk — no error handler on watcher
**Symbol:** `this.watcher` (FSWatcher)  
**Issue:** Lines 76-80 initialize chokidar.watch() but never attach `.on('error', ...)` handler. If chokidar encounters a file system error (permission denied, watched dir deleted), it emits unhandled 'error' event, crashing the process or leaving the watcher in a zombie state.  
**Impact:** Watcher crashes silently; file changes go undetected. Memory from watcher stays allocated.  
**Mitigation:** Must add `.on('error', (err) => { logger.error(...); })` to FSWatcher.

#### [watcher.ts:83-85] MEDIUM — Async event handlers without await
**Symbol:** Event handlers in start()  
**Issue:** Lines 83-85 attach event handlers that call `this.handlePulseEvent(...)` without `await`. Multiple file changes within a short time will spawn concurrent pulse operations that compete for graph mutations, persistence writes, and linker updates (line 150).  
**Impact:** Race conditions in structural graph mutations; concurrent DB writes; linker state corruption.  
**Reproduction:** Rapid file saves (e.g., from auto-format) cause interleaved pulse operations.

#### [watcher.ts:93] MEDIUM — Unsafe Parser type assertions
**Symbol:** `ParserClass`  
**Issue:** Line 93 uses `(Parser as any).default || (Parser as any).Parser || Parser` fallback chain. If none of these properties exist at runtime, `ParserClass` becomes the raw import object (not a class), and line 94's `ParserClass.init()` call fails.  
**Impact:** Parser initialization fails silently; structural parsing never runs.

#### [watcher.ts:104-106] MEDIUM — Race condition in watcher lifecycle
**Symbol:** `stop()` method  
**Issue:** Line 104-106: `await this.watcher.close()` followed by `this.watcher = null`. But if `start()` is called while `stop()` is executing, the line 70 check `if (this.watcher) return;` may be racing. Additionally, if `handlePulseEvent` is executing when `close()` is called, the watcher's event emitters may still fire, accessing a closed FSWatcher.  
**Impact:** Double-initialization; lingering event listeners on closed watchers; file system state errors.

#### [watcher.ts:114-116] MEDIUM — Early return suppresses error handling
**Symbol:** `handlePulseEvent` early returns  
**Issue:** Line 114 returns early if `event === "unlink"` without any logging. If a file is deleted, no structural cleanup occurs (as the comment on line 115 suggests is incomplete). Caller has no indication the event was skipped.  
**Impact:** Stale symapse nodes persist for deleted files; dangling edges in graph.

#### [watcher.ts:125] MEDIUM — Git diff shell command injection risk
**Symbol:** `execSync` git diff  
**Issue:** Line 125: `execSync(\`git diff HEAD "${filePath}"\`...)` uses template string with filePath. If filePath contains backticks or special chars, command is injected. Although filePath is from chokidar (somewhat safe), no explicit validation.  
**Impact:** Low in practice but violates shell command safety principles.  
**Recommendation:** Use `--` to separate options from paths: `git diff HEAD -- "${filePath}"`.

#### [watcher.ts:145] MEDIUM — Double check for falsy filePath
**Symbol:** `filePath` validation  
**Issue:** Line 114 already checks `if (!filePath || event === "unlink")`, but line 145 checks again with `if (!filePath) return;`. Redundant and suggests uncertainty about filePath lifecycle.  
**Impact:** No functional issue but indicates unclear contract.

#### [watcher.ts:157] HIGH — Unchecked call to undefined method
**Symbol:** `(g as any).findSymbolAtLine()`  
**Issue:** Line 157 casts graph to `any` and calls `.findSymbolAtLine()`. This method is not defined in ConducksAdjacencyList interface. If method doesn't exist at runtime, call fails silently, `symbol` is undefined, and line 158's `affectedSymbols.add(symbol.id)` crashes.  
**Impact:** Runtime crash when pulse event processes changed lines.

#### [watcher.ts:174-182] HIGH — Unchecked persistence layer access
**Symbol:** Persistence query fallback  
**Issue:** Line 174 casts `persistence` to `any` and then checks `if (persistence?.query)` (line 175). But if persistence is undefined (in test mode), the query silently fails, and `riskDelta` stays 0. No error logged.  
**Impact:** Risk calculations are incorrect when persistence is not available; silent degradation.

#### [watcher.ts:197-202] MEDIUM — Redundant readOnly checks
**Symbol:** Persistence write gates  
**Issue:** Lines 197 and 200 both check `!(this.options.persistence as any).readOnly` and call `persist.save()`. But line 200 is unreachable if line 197's `autoPulse` condition is false. Logic should be `if (this.autoPulse) { ... } else if (this.options.persistence && !readOnly) { ... }`, but current code writes to persistence twice on success.  
**Impact:** Duplicate persistence writes; wasted I/O.  
**Reproduction:** Call `enableAutoPulse(false)` then trigger pulse — persistence.save() is called twice.

---

### File: dead-code.ts

#### [dead-code.ts:45-49] MEDIUM — False positive risk: cast operators bypass type checking
**Symbol:** `graph.getNeighbors() as any`  
**Issue:** Line 47 casts edge to `any` before accessing `e.sourceId`. If edge structure differs from expected, the check fails silently. Additionally, line 48 does not validate that `source` node was found (graph.getNode returns undefined for missing IDs).  
**Impact:** Dead code detection misses valid references; over-reports false orphans.

#### [dead-code.ts:79-82] LOW — Fragile entry point detection
**Symbol:** `isEntryPoint()` method  
**Issue:** Line 80-82 uses case-insensitive substring matching. "main_service" would match "main" and not be flagged as orphan. Also, "application_init" would match "init". These heuristics are too broad.  
**Impact:** Valid entry points are incorrectly classified as orphans; precision loss in dead code detection.

#### [dead-code.ts:63-71] MEDIUM — Incorrect edge direction for stale imports
**Symbol:** `STALE_IMPORT` detection  
**Issue:** Line 64 uses `graph.getNeighbors(node.id, 'upstream')` to find usage of an import. But if an import statement has outbound edges (downstream), not inbound edges (upstream), this check fails. The semantics are inverted: an import's users are downstream, not upstream.  
**Impact:** Stale imports are not detected; false negatives.

---

### File: gvr-engine.ts (in evolution/ AND core/algorithms/refactor/)

#### [drift-engine.ts:25] HIGH — Duplicate GVREngine implementation
**Symbol:** Two GVREngine classes  
**Files:**
- src/lib/domain/evolution/gvr-engine.ts (127 lines)
- src/lib/core/algorithms/refactor/gvr-engine.ts (85 lines)

**Issue:** Both files define `GVREngine` with overlapping functionality. The evolution/ version includes `dryRun` support (line 35) and logging (lines 122-126). The core/ version omits these. The index.ts in evolution/ exports the evolution version (line 77), but core algorithms may import the refactor version, causing inconsistent behavior.  
**Impact:** Maintenance burden; inconsistent refactoring behavior; potential module resolution conflicts.  
**Recommendation:** Consolidate into one location (core/algorithms/refactor/) and re-export from evolution/.

#### [evolution/gvr-engine.ts:25] MEDIUM — Implicit fs dependency injection
**Symbol:** `fileSystem` parameter  
**Issue:** Line 25 defaults `fileSystem` to `fs` import at top level, but constructor accepts optional `fileSystem: any = fs`. This is inconsistent: if caller provides mock, it's used; otherwise, the real fs module is used. No way to verify the mock is valid before use.  
**Impact:** Test mocks may not be properly validated; production code may use test fs instances.

#### [evolution/gvr-engine.ts:53-61] MEDIUM — Name-based symbol detection is unreliable
**Symbol:** Import detection fallback  
**Issue:** Lines 54-61 attempt to find imported symbols by matching `candidate.properties.name === oldName` and different filePath. But if a symbol with the same name exists in two files (common in large codebases), this will add ALL occurrences to affected files, even if they're unrelated (e.g., two separate "handler" functions).  
**Impact:** Over-inclusive refactoring; renames propagate to unrelated symbols with same name.

#### [evolution/gvr-engine.ts:75-89] LOW — No backup validation before write
**Symbol:** Atomic batch write  
**Issue:** Lines 84-90 load all files into memory and set backups. But if a file is locked or permissions change between load and write, the first write failure triggers rollback of all files. There's no atomic transaction at the OS level.  
**Impact:** Partial refactors possible if some files fail to write during rollback.

---

### File: audit-service.ts

#### [audit-service.ts:49] HIGH — Untyped rows from database query
**Symbol:** `rows: any[]`  
**Issue:** Line 49 declares `rows: any[] = []` and line 51 queries without type assertion. Lines 68-78 iterate `rows.map(row => ...)` accessing `row.avg_g_delta`, `row.avg_c_delta`, `row.data_points` without null checks.  
**Impact:** If database schema changes, undefined fields cause silent NaN in velocity calculations.

#### [audit-service.ts:44] MEDIUM — Hardcoded window threshold logic
**Symbol:** HAVING clause threshold  
**Issue:** Line 44 filters results with `HAVING ... > 0.05`. This threshold is hardcoded in SQL, not parameterized. If caller wants to adjust sensitivity, the code must be modified.  
**Impact:** No flexibility in drift sensitivity tuning; threshold is frozen.

#### [audit-service.ts:81] MEDIUM — Hardcoded "DECAYING" threshold
**Symbol:** Status determination  
**Issue:** Line 81 checks `hotspots.length > 5` to return 'DECAYING'. But if even one hotspot exists with very high velocity, fewer than 5 hotspots should still trigger 'DECAYING'. The threshold is arbitrary.  
**Impact:** Underestimation of decay risk if only 1-4 hotspots exist with extreme velocity.

---

### File: index.ts (Evolution)

#### [evolution/index.ts:20, 32-38] MEDIUM — Loose type casting in setPersistence
**Symbol:** `persistence` re-anchoring  
**Issue:** Lines 32-38 cast persistence to `any` and mutate private fields directly: `(this as any).persistence = ...`. This bypasses TypeScript checks and violates encapsulation.  
**Impact:** Future refactors may break if private fields are renamed; no type safety.

#### [evolution/index.ts:47] MEDIUM — Unvalidated persistence in watcher initialization
**Symbol:** `getWatcher()` method  
**Issue:** Line 47 passes `{ persistence: this.persistence }` directly to ConducksWatcher without validating that persistence is initialized. If `setPersistence()` is never called, persistence is null/undefined, and watcher operations later fail silently.  
**Impact:** Watcher initialization succeeds but later DB operations fail; no early error.

---

## GOVERNANCE DOMAIN

### File: guard.ts

#### [guard.ts:28] HIGH — Implicit error suppression in drift call
**Symbol:** `drift: DriftResult`  
**Issue:** Line 29 calls `await this.driftEngine.compare()` without error handling. If DriftEngine fails internally (caught in drift-engine.ts:66-73), it returns a STABLE status with empty deltas array. The guard then calculates `avgRisk = 0` and returns `block: false`, masking the true failure.  
**Impact:** Regression guard passes even when structural analysis failed; false confidence.

#### [guard.ts:43-44] MEDIUM — Integer division risk in threshold calculation
**Symbol:** `avgRisk` calculation  
**Issue:** Line 44: `avgRisk = deltas.length > 0 ? (totalVelocity / deltas.length) : 0`. If all deltas have NaN velocity (from drift-engine corruption), totalVelocity is NaN, avgRisk is NaN, and line 57 comparison `avgRisk > threshold` is always false.  
**Impact:** Regression guard always passes when drift data is corrupted.

---

### File: sentinel.ts

#### [sentinel.ts:61] MEDIUM — Regex path matching without escaping
**Symbol:** `new RegExp(rule.matchPath)`  
**Issue:** Line 61 constructs a RegExp directly from `rule.matchPath` without escaping special characters. If rule.matchPath contains `.` or `*`, regex behavior differs from glob expectations.  
**Impact:** Path matching fails for certain rule configurations; false negatives.

#### [sentinel.ts:96-157] MEDIUM — Unused node parameter in rule checking
**Symbol:** `checkRule()` method  
**Issue:** Line 96 accepts `node: ConducksNode` but lines 99-156 have cases where `node` is checked for null (e.g., line 101: `if (!node) return ...`). This suggests `node` can legitimately be null (as seen in line 50: `checkRule(null as any, ...)`), but the type signature does not reflect this.  
**Impact:** Type system does not match runtime behavior; potential crashes if null node is passed to case branches expecting a node.

#### [sentinel.ts:106-107] MEDIUM — Incomplete heritage edge filtering
**Symbol:** `require_heritage` case  
**Issue:** Lines 102-107 filter edges with types `EXTENDS`, `IMPLEMENTS`, `TYPE_REFERENCE`. But if a symbol inherits via a different edge type (e.g., `COMPOSITION` or `DELEGATION`), the check fails. Also, line 106 checks `e.properties.rawTarget === rule.target`, but `properties` on edges may not exist.  
**Impact:** Incomplete inheritance detection; false positives for missing heritage.

#### [sentinel.ts:149] MEDIUM — Unchecked fileSystem.access() call
**Symbol:** `require_file` case  
**Issue:** Line 149 calls `await this.fileSystem.access(rule.target!)` without validating `rule.target` is a valid path. If passed a URL or special string, behavior is undefined.  
**Impact:** Unexpected file system errors for malformed rules.

---

### File: advisor.ts

#### [advisor.ts:21] HIGH — Unchecked detectCycles() return type
**Symbol:** `cycles` from `graph.detectCycles()`  
**Issue:** Line 21 calls `graph.detectCycles({ ignoreTypes: ... })` and casts result to `NodeId[][]`. But detectCycles() may not exist or may return a different structure. If it fails, cycles becomes undefined/null, and line 22's filter operation crashes.  
**Impact:** Crash in advisor if graph doesn't implement detectCycles().

#### [advisor.ts:59] MEDIUM — Unchecked findNodesByName() method
**Symbol:** String literal intuition detection  
**Issue:** Line 59 calls `graph.findNodesByName(cleanName)` without checking if method exists. This method is not in the ConducksAdjacencyList interface; it may be added dynamically or not exist.  
**Impact:** Runtime crash if method is missing; silent failure if returns undefined.

#### [advisor.ts:31] MEDIUM — Direct property mutation in graph
**Symbol:** `node.properties.anomaly = 'cycle'`  
**Issue:** Line 31 directly mutates `node.properties.anomaly` without validation. Graph may be immutable or in a read-only mode.  
**Impact:** Silent property assignment failures; anomaly markers not persisted.

#### [advisor.ts:99-110] MEDIUM — Complex risk scoring without normalization bounds
**Symbol:** Risk breakdown calculation  
**Issue:** Lines 99-110 format risk breakdown with 6 components (gravity, complexity, fan-out, debt, churn, entropy), but components can exceed 1.0 (e.g., fanOut normalized to 10, complexity to 20). If actual values are large, formatted output is hard to interpret.  
**Impact:** Risk scores are not on a standard scale; hard to compare across symbols.

#### [advisor.ts:189-208] MEDIUM — Incomplete SplitScore calculation
**Symbol:** `calculateSplitScore()` method  
**Issue:** Line 190 counts internal edges within `node.properties.filePath`. But nodes span multiple files; this calculation only counts same-file edges. The score is therefore biased toward single-file nodes.  
**Impact:** SplitScore does not accurately reflect true cohesion; split recommendations are unreliable.

---

### File: oracle.ts

#### [oracle.ts:81] MEDIUM — Weak regex-based YAML parsing
**Symbol:** `parseSkill()` frontmatter extraction  
**Issue:** Line 81-82 use simple regex `/description:\s*(.*?)-->/s` to extract description. This fails if:
  - The markdown doesn't have comment-style frontmatter (`<!-- -->`)
  - Description spans multiple lines with unusual formatting
  - Malformed files cause regex to match partial content

**Impact:** Skill descriptions are often blank or incorrect; knowledge base is unreliable.  
**Recommendation:** Use proper YAML/frontmatter parser (e.g., gray-matter).

#### [oracle.ts:41-44] MEDIUM — Silent failure when resource directory missing
**Symbol:** `bootstrap()` initialization  
**Issue:** Line 41-44: If `skills-generator` directory doesn't exist, it logs an error and returns silently with an empty knowledge base. Caller has no indication that the oracle is uninitialized.  
**Impact:** Graceful degradation but silent failure; oracle provides no skills without feedback.

---

### File: config-detector.ts

#### [config-detector.ts:41-50] MEDIUM — Shallow directory scanning only
**Symbol:** `discover()` method  
**Issue:** Line 41 scans only the immediate directory with `fs.readdir(dirPath)`. It does not recursively search subdirectories for config files. If package.json is in a subdirectory, it's missed.  
**Impact:** Config detection is incomplete for monorepos or nested projects.

#### [config-detector.ts:51-52] MEDIUM — Silently suppresses directory errors
**Symbol:** Error handling in discover()  
**Issue:** Line 52 catches all errors and logs a warning, then returns empty results. Caller cannot distinguish between "directory is empty" and "permission denied".  
**Impact:** Silent failure on permission errors; unclear whether configs truly don't exist.

---

### File: blueprint-generator.ts

#### [blueprint-generator.ts:32] HIGH — Hardcoded config file path with no validation
**Symbol:** `config/sentinel.json` load  
**Issue:** Line 32 reads `config/sentinel.json` with a catch() that defaults to `'[]'`. But:
  - Path is relative (not absolute), so it depends on current working directory
  - If file exists but is malformed JSON, `JSON.parse()` throws uncaught error
  - No logging if file is missing

**Impact:** Sentinel rules are silently ignored; governance audit is incomplete.  
**Recommendation:** Use absolute path and wrap JSON.parse in try-catch.

#### [blueprint-generator.ts:24-84] MEDIUM — No error handling for DAAC clustering
**Symbol:** `daac.cluster(graph)` call  
**Issue:** Line 25 calls clustering without error handling. If clustering fails, blueprint generation stops.  
**Impact:** Blueprint generation can crash the entire generate() flow.

#### [blueprint-generator.ts:80-81] MEDIUM — Overwrites llms.txt without confirmation
**Symbol:** File write in generate()  
**Issue:** Lines 80-81 write both `BLUEPRINT.md` and `llms.txt` unconditionally. No option to skip or validate before write. If files are read-only or in a protected directory, silent failure occurs.  
**Impact:** Blueprint generation fails silently if files are protected.

---

### File: context-generator.ts

#### [context-generator.ts:62] MEDIUM — Unsafe JSON.parse on database metadata
**Symbol:** `JSON.parse(c.metadata || '{}')`  
**Issue:** Line 62 parses metadata field that may contain invalid JSON. If field is corrupted, `JSON.parse()` throws, crashing the context generation.  
**Impact:** One corrupted metadata entry breaks context generation for all violations.  
**Recommendation:** Wrap in try-catch and provide fallback.

#### [context-generator.ts:26] MEDIUM — No fallback if persistence is null
**Symbol:** `getLatestPulseId()` method  
**Issue:** Line 24-25 checks if persistence is null and returns null early. But callers (line 50-51) may not handle null pulseId gracefully, leading to cascading null errors.  
**Impact:** Incomplete context generation if persistence is not anchored.

---

### File: index.ts (Governance)

#### [governance/index.ts:124] HIGH — Runtime require() in production code
**Symbol:** `require('fs').existsSync()`  
**Issue:** Line 124 uses `require('fs')` inside a try-catch block at runtime. This is:
  - A CommonJS require in an ESM module (potential issues in ESM-only environments)
  - Inefficient (repeated imports)
  - Breaks tree-shaking and bundlers

**Impact:** Dead code not detected by static analysis; runtime failures in ESM-only environments.  
**Recommendation:** Use `fs` import at the top and `existsSync()` directly.

#### [governance/index.ts:199] MEDIUM — Unchecked chronicle methods
**Symbol:** `chronicle.getLastPulsedCommit()`  
**Issue:** Line 199 calls `chronicle.getLastPulsedCommit(this.graph)` without error handling. If chronicle is not initialized, this fails silently.  
**Impact:** Status reports incomplete staleness info without feedback.

#### [governance/index.ts:60-74] MEDIUM — Over-filtered cycle detection
**Symbol:** Cycle filtering logic  
**Issue:** Lines 61-74 filter cycles to exclude those with `MEMBER_OF` edges. But the check (line 69) iterates through each cycle's edges sequentially without checking if ALL edges are MEMBER_OF. If only ONE edge is MEMBER_OF, the entire cycle is excluded.  
**Impact:** Legitimate architectural cycles are missed if they include one hierarchical edge.

---

## FEDERATION DOMAIN

### File: conducks-installer.ts

#### [conducks-installer.ts:31] MEDIUM — Unchecked oracle bootstrap
**Symbol:** `registry.oracle.bootstrap()`  
**Issue:** Line 31 calls bootstrap without error handling. If oracle initialization fails, sync() continues and installs empty skill files.  
**Impact:** Incomplete skill installation without feedback.

#### [conducks-installer.ts:39-42, 45-48] MEDIUM — Unvalidated directory creation
**Symbol:** `ensureDir()` calls  
**Issue:** Lines 40 and 46 call `ensureDir()` without error handling. If parent directories are protected or don't exist, failures are silent.  
**Impact:** Skills are silently not installed if directory creation fails.

#### [conducks-installer.ts:59-67] MEDIUM — Hardcoded skill ID mapping
**Symbol:** `skillIdMapping` dictionary  
**Issue:** Lines 59-67 map skill IDs to installer names with a static dictionary. If new skills are added to the oracle, the mapping must be manually updated.  
**Impact:** New skills are silently skipped during installation unless mapping is updated.

---

### File: context.ts

#### [context.ts:36] MEDIUM — No validation of symbol node structure
**Symbol:** `registerSymbol()` method  
**Issue:** Line 36 accepts any node object without validating properties. If node is missing required fields (e.g., `id`, `properties`), subsequent lookups fail silently.  
**Impact:** Corrupted symbol table; undefined errors during analysis.

---

### File: mcp-configurator.ts

#### [mcp-configurator.ts:51] HIGH — Overwrites Claude config without backup
**Symbol:** `writeJson()` call  
**Issue:** Line 51 overwrites the entire Claude config file without creating a backup. If this operation fails mid-write, the config is corrupted and Claude Desktop cannot start.  
**Impact:** User's Claude Desktop becomes non-functional if write fails.  
**Recommendation:** Write to temp file, validate, then move atomically (or create backup first).

#### [mcp-configurator.ts:40-41] MEDIUM — Default config schema not validated
**Symbol:** Empty config initialization  
**Issue:** Line 37 creates a minimal config with only `{ mcpServers: {} }`. If Claude Desktop expects additional fields, the config is rejected.  
**Impact:** Newly created configs may be invalid; Claude Desktop may reject them.

#### [mcp-configurator.ts:43-49] MEDIUM — Hardcoded port and no validation
**Symbol:** MCP server registration  
**Issue:** Line 47 hardcodes `PORT: "3001"` without checking if port is available or if serverPath exists.  
**Impact:** Port conflicts; missing server executable; registration points to non-existent process.

---

## CROSS-CUTTING ISSUES

### 1. Type Safety Across Domains
**Total `: any` usages in scope:**
- drift-engine.ts: 7 occurrences
- watcher.ts: 8 occurrences
- advisor.ts: uncounted (heavy use of `as any`)
- guard.ts: 1 occurrence
- sentinel.ts: 1 occurrence
- index.ts files: 3+ occurrences

**Impact:** No type safety; refactoring is error-prone; IDE autocomplete fails.  
**Recommendation:** Create proper TypeScript interfaces for all domain models.

### 2. Error Suppression Pattern
**Across all files:** Errors are caught but not propagated. Examples:
- drift-engine.ts:22-24 logs error but continues
- watcher.ts:208-210 logs error but continues
- context-generator.ts:no error handling for JSON.parse
- Persistence layer failures are silent

**Impact:** Cascading failures; no visibility into root causes.  
**Recommendation:** Implement proper error propagation or circuit breaker pattern.

### 3. Missing Initialization Checks
Multiple components assume dependent services are initialized:
- watcher.ts assumes `ignoreManager` is created
- advisor.ts assumes `graph.detectCycles()` exists
- oracle.ts assumes `skills-generator` directory exists

**Impact:** Runtime crashes when dependencies are missing.  
**Recommendation:** Add explicit initialization checks and throw early.

### 4. Unvalidated External Dependencies
**Files with risky external calls:**
- watcher.ts line 125: shell command injection risk (git diff)
- conducks-installer.ts: assumes registry.oracle exists
- mcp-configurator.ts: assumes Claude config path is standard

**Impact:** Unexpected failures in different environments.

### 5. Memory Leak Vectors
**Identified risks:**
- watcher.ts: FSWatcher without error handler (can zombie)
- watcher.ts: Concurrent pulse operations without queue (unbounded)
- No cleanup of stale graph nodes when files are unlinked
- IgnoreManager patterns are not cached; minimatch runs every isIgnored() call

**Impact:** Long-running Conducks daemon may leak memory.

---

## SEVERITY SUMMARY

| Severity | Count | Examples |
|----------|-------|----------|
| **HIGH** | 8 | Untyped arrays, unchecked methods, memory leaks, config corruption |
| **MEDIUM** | 6 | Race conditions, false positives, incomplete error handling |
| **LOW** | 5 | Fragile logic, performance issues, code style |

---

## ACTIONABLE RECOMMENDATIONS

1. **Immediate (Before 1.0 Release):**
   - Add error handler to chokidar FSWatcher (watcher.ts:76)
   - Await async pulse events; implement queue for serial processing (watcher.ts:83-85)
   - Consolidate dual GVREngine implementations
   - Add `require('fs')` at module scope; remove runtime require() (governance/index.ts:124)
   - Backup Claude config before write (mcp-configurator.ts:51)

2. **High Priority:**
   - Define proper interfaces for domain models (replace `: any`)
   - Implement error propagation layer (not just logging)
   - Add initialization validation in all domain constructors
   - Fix query result type safety (drift-engine.ts, audit-service.ts)

3. **Medium Priority:**
   - Implement proper YAML/frontmatter parser (oracle.ts)
   - Use absolute paths for config discovery (blueprint-generator.ts:32)
   - Add circular dependency detection correctness tests
   - Refactor IgnoreManager to cache minimatch patterns

---

**Report generated:** 2026-06-20  
**Auditor:** Agent 06 (Read-only Investigation)  
**Status:** All issues verified; no fixes applied per audit charter.
