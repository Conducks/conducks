# Agent 05 — C8: Duplicate QueryService Resolution

## Task
Two files both export `QueryService` with incompatible signatures:
- `src/lib/domain/analysis/query-service.ts`
- `src/lib/domain/intelligence/query-service.ts`

## Investigation

### Method signatures compared

| Aspect | analysis/query-service.ts | intelligence/query-service.ts |
|---|---|---|
| `execute()` signature | `execute(templateId: string, userParams: any[], limit?: number)` — positional params | `execute(templateName: string, params: Record<string, any>)` — named params object |
| SQL binding style | Positional `?` placeholders | Named `$param` placeholders (DuckDB-style) |
| Template storage | `static readonly QUERIES` (public) | `private readonly TEMPLATES` |
| Pulse resolution | Uses `this.persistence.query()` | Uses `db.all()` via `getRawConnection()` |
| Logger import | `new Logger("QueryService")` (class constructor) | `import { logger }` (singleton) |
| Template count | 15 templates (richer set) | 11 templates (subset) |

### Caller audit

```
grep -r "query-service" src --include="*.ts" -l
→ src/lib/domain/analysis/index.ts  (only one file)

grep -r "QueryService" src --include="*.ts" -l
→ src/lib/domain/analysis/query-service.ts  (definition)
→ src/lib/domain/analysis/index.ts           (caller)
→ src/lib/domain/intelligence/query-service.ts  (definition, no callers)
```

The `intelligence/query-service.ts` is **never imported** anywhere:
- `intelligence/index.ts` does not export or import it
- No file in `src/` imports from `intelligence/query-service`

### Verdict

`src/lib/domain/intelligence/query-service.ts` is a dead orphan — likely an earlier draft that was superseded by the richer `analysis/query-service.ts`. Zero callers. Safe to delete.

## Action Taken

Deleted: `src/lib/domain/intelligence/query-service.ts`

## Post-deletion verification

- Confirmed no remaining imports point to the deleted file
- Ran `tsc --noEmit` — exits clean, zero errors
