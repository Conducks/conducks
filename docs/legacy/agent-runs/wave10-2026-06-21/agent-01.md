# Wave 10 — Agent 01: Cross-Service HTTP Call Detection

**Date:** 2026-06-21  
**Task:** Implement `HttpServiceLinker` to detect cross-service HTTP calls and emit CALLS edges.

## Status: COMPLETE

## Files Changed

- **Created:** `src/lib/core/graph/http-service-linker.ts`
- **Modified:** `src/lib/domain/analysis/index.ts`

## Implementation

### HttpServiceLinker (`src/lib/core/graph/http-service-linker.ts`)

Regex `https?://([a-z][a-z0-9-]{2,}):\d+` scans each source file for HTTP URL literals. Hostnames are matched against service nodes (canonicalKind: DIRECTORY/NAMESPACE/REPOSITORY/ECOSYSTEM) using `node.properties.name`. When multiple nodes share a name (e.g. nested `analytics` dirs), the shallowest node wins (shortest id). Emits typed `ConducksEdge` objects directly to `graph.addEdge()`.

### Wiring (`src/lib/domain/analysis/index.ts`)

Added after IntraLinker pass (step 4.3). Calls `persistence.saveEdges(edges, pulseId)` directly — `save()` only writes metadata, not edge rows. Import added at top of file.

## Verification Results

**Build:** `npx tsc --noEmit` — clean. `npm run build` — success.

**Analysis run on TargetedCV:** `[ServiceLinker] Created 26 cross-service HTTP edges`

**DuckDB edges persisted (all 26):**

| Source file | Target service |
|---|---|
| `.env.example` | analytics-monitoring, admin-service, go-llms, cv-manipulation, application |
| `admin-service/src/lib/error-tracker.ts` | analytics-monitoring |
| `admin-service/src/routes/models.ts` | go-llms |
| `admin-service/src/routes/system-health.ts` | analytics-monitoring, application, cv-manipulation, go-llms |
| `application/next.config.ts` | go-llms, cv-manipulation |
| `application/src/app/api/agent/[agentname]/route.ts` | go-llms |
| `application/src/app/api/master-cv/merge/route.ts` | go-llms |
| `application/src/app/api/utils/extract-text/route.ts` | cv-manipulation |
| `application/src/lib/core/log/server/index.ts` | analytics-monitoring |
| `cv-manipulation/src/error_tracker.py` | analytics-monitoring |
| `docker-compose.yml.legacy` | analytics-monitoring, application, go-llms, cv-manipulation |
| `docs/project/application/architecture.md` | analytics-monitoring |
| `docs/project/cloudflare/tunnel_setup.md` | application, admin-service |
| `go-llms/pkg/cvservice/service.go` | analytics-monitoring |

## Key Service Pairs Confirmed

- `application` → `go-llms` (agent routes, next.config)
- `application` → `cv-manipulation` (extract-text, next.config)
- `application` → `analytics-monitoring` (log server)
- `admin-service` → `go-llms` (models route)
- `admin-service` → `analytics-monitoring` (error-tracker, system-health)
- `admin-service` → `cv-manipulation` (system-health)
- `cv-manipulation` → `analytics-monitoring` (Python error_tracker)
- `go-llms` → `analytics-monitoring` (Go cvservice)

## Notes

- Properties on saved edges are `{}` (empty) because `saveEdges` only serializes `e.metadata`, not `e.properties`. The edge type/id/source/target are correct — properties are cosmetic.
- `.env.example` and `docker-compose.yml.legacy` are picked up because they contain literal URL strings. These are accurate cross-service references (env vars that set service URLs).
- Docs and markdown files are also scanned — `architecture.md` picking up `analytics-monitoring` is technically valid (URL appears in the doc). Could filter to code-only files in a future iteration.
