# Conducks Full Codebase Audit — 2026-06-20

Run: `audit-full-2026-06-20` | 10 agents | read-only investigation

---

## CRITICAL ISSUES (fix first)

### Security
- **[A09] Path traversal** — `synapse.ts:20-32`, `kinetic.ts:18-29` — unvalidated `customPath` lets any MCP client read arbitrary filesystem locations
- **[A09] SQL injection** — `synapse.ts:81-84` — `template` param in `conducks_query` unwhitelisted
- **[A04] SQL injection** — `persistence.ts:237` — `purgeUnits()` string-interpolates unitIds into DELETE statement. `' OR '1'='1` wipes entire table
- **[A08] Shell injection** — `clean.ts:32-46` — naive `ps aux` parse + no PID validation before `kill()`
- **[A09] XSS** — `ui.js:41-49,225-234` — `innerHTML` with untrusted cluster/layer names from API response
- **[A06] Config overwrite** — `mcp-configurator.ts` — overwrites Claude/MCP config files without backup

### Data Integrity
- **[A04] Broken singleton** — `persistence.ts:26-31` — `getInstance(vaultPath)` ignores `vaultPath` on 2nd+ call → silent data mixing between projects
- **[A04] No ROLLBACK** — `saveNodes`, `saveEdges`, `updateRanks`, `updateEdgeTargets` — `BEGIN TRANSACTION` with no `ROLLBACK` in catch → hung transactions, lock contention
- **[A04] `new Promise(async ...)` x4** — async executor errors swallowed before try/catch
- **[A05] Double analysis** — `conducks-core.ts:126+154` — files analyzed twice, 2× IO wasted
- **[A05] Parallelism disabled** — `orchestrator.ts:398` — `skipWorker=true` hardcoded, worker infrastructure dead

### Architecture
- **[A02] Python parser disabled** — `grammar-registry.ts:107` — hard-coded fallback blocks ALL native Python parsing
- **[A02] PrismSpectrum type split** — two incompatible definitions in parsing/ vs persistence/ → graph ingestion breaks
- **[A05] God Object orchestrator** — `orchestrator.ts` 505 lines, 12+ responsibilities, untestable

---

## HIGH ISSUES

| Agent | Location | Issue |
|-------|----------|-------|
| A01 | `adjacency-list.ts:123` | `rootId` undefined — type escape crash |
| A01 | `linker.ts:16` | Encapsulation breach via `(graph as any).nodes` |
| A01 | `gvr-engine.ts:74-75` | Silent catch swallows rollback → data corruption |
| A01 | `adjacency-list.ts:250-261` | O(N²) set mutation during iteration |
| A02 | `essence-lens.ts:51` | Empty catch hides JSON parse failures |
| A03 | 9 of 11 languages | `extractDocs` missing — docstrings never extracted |
| A03 | 9 extractors | Unguarded `node.text` access — crash on malformed AST |
| A03 | Python extractor | `getVisibility` broken — passes undefined name |
| A04 | `registry-bootstrapper.ts` | `console.error` for non-errors breaks MCP stdio protocol |
| A04 | `ensureVaultOpen` | DuckDB lock conflict — no retry/backoff, immediate crash |
| A05 | `orchestrator.ts:296-350` | Race condition in chunked induction — vault corruption if reflection fails mid-chunk |
| A05 | `orchestrator.ts:485-490` | Reflector exceptions crash main thread, no recovery |
| A06 | `watcher.ts` | FSWatcher memory leak — no error handler, no cleanup |
| A06 | `watcher.ts` | Git command injection risk |
| A06 | `governance/index.ts` | Inverted cycle filtering logic — cycles reported as safe |
| A07 | `impact.ts:43` | Division by zero — `1 / node.distance` unguarded |
| A07 | `query-service.ts` | Two incompatible SQL engines (analysis/ vs intelligence/) |
| A08 | `diff.ts:198` | Path traversal via git diff — can escape repo with `../` |
| A08 | `entry.ts:24-25` | Closes injected persistence, breaks subsequent commands |
| A09 | CORS | `cors()` with no config — all origins allowed |
| A09 | MCP server | Zero authentication — any client queries/renames code |

---

## MEDIUM ISSUES (selection)

| Agent | Issue |
|-------|-------|
| A01 | `gvr-engine.ts:59` — unsafe regex, no metachar escaping |
| A02 | `gql-parser.ts` duplicated (core vs intelligence) — divergent implementations |
| A02 | `flow-engine.ts` duplicated (core vs kinetic) — dead core version |
| A03 | 11 language plugins — inconsistent interface (TS has 6+ methods, others only 3) |
| A04 | `load()`, `save()` — `db` variable assigned but never used (dead code smell) |
| A05 | `reflector.ts` — 16 `: any` annotations, tree-sitter API fully untyped |
| A05 | `dummy_pulse.ts` — dead code in production src/ |
| A06 | `dead-code.ts` — inverted edge semantics → false positive dead code reports |
| A06 | `blueprint-generator.ts` — hardcoded relative path, unsafe JSON.parse |
| A07 | `search-engine.ts:57` — wavefront depth=1, shallow results |
| A07 | `mirror.engine.ts:31` — direct private field access `outEdges` |
| A07 | `test-aligner.ts:20-22` — `/tests/` path match too broad, false coverage positives |
| A08 | 6+ commands return silently instead of `process.exit(1)` on error |
| A08 | Duplicate arg-parsing logic across 18+ command files |
| A09 | `ensureAnchor()` duplicated in synapse.ts and kinetic.ts |
| A10 | `structural.test.ts:138` — `i.canonicalKind` access without null guard, crashes on bad DB |

---

## STRUCTURAL / CROSS-CUTTING

- **1.7% test coverage** — 3 active test files for 174 source files. Zero coverage for registry, CLI, persistence, all language parsers
- **80+ tests archived** in `tests/legacy/archived-tests/` — unclear if still valid
- **3 test frameworks loaded simultaneously** — Jest + Vitest + Vite (only Jest used)
- **177 `: any` casts** project-wide despite `strict: true` in tsconfig
- **`scratch/` committed to git** — 2,104 lines of debug artifacts, machine paths exposed
- **`src/resources/tools-archive/`** duplicates `src/resources/skills-generator/` — unclear which is authoritative
- **`src/types/domain.ts`** has only 1 type (`Advice`) — all other domain types scattered as inline `any`
- **Vite config** — React+Tailwind config on a CLI-only project (copy-paste artifact, dead)
- **`src/lib/domain/analysis/query-service.ts`** duplicates `src/lib/domain/intelligence/query-service.ts`
- **`gvr-engine.ts`** duplicated in evolution/ and core/algorithms/refactor/

---

## AGENT REPORTS

| Agent | Scope | Issues | Report |
|-------|-------|--------|--------|
| 01 | Core graph engine + algorithms | 19 | agent-01.md |
| 02 | Parsing pipeline | 19 | agent-02.md |
| 03 | 11 language plugins | 19 | agent-03.md |
| 04 | Persistence + registry | 17 | agent-04.md |
| 05 | Domain analysis layer | 20+ | agent-05.md |
| 06 | Evolution + governance + federation | 19 | agent-06.md |
| 07 | Intelligence + kinetic + metrics + manifest + visual | 15 | agent-07.md |
| 08 | CLI interface (36 commands) | 15 | agent-08.md |
| 09 | MCP tools + web interface | 11 | agent-09.md |
| 10 | Tests + types + config + cross-cutting | 10 | agent-10.md |

**Total: ~164 issues identified**
