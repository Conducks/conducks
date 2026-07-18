# Wave 4 — Agent 02 — Q9 + Q10

Date: 2026-06-21

## Q9 — Decompression failure throws instead of returning stale skeleton

File: `src/lib/core/graph/adjacency-list.ts` (getNode method, ~line 371)

Change: In the `catch` block of the decompression path inside `getNode()`, replaced `console.error(...)` + fall-through to `return skeleton` with `throw new Error(...)`. Callers now get a hard failure instead of silently receiving stale skeleton data.

```diff
-  } catch (err) {
-    console.error(`[Conducks VMC] Decompression failed for node ${id}:`, err);
-  }
+  } catch (err) {
+    throw new Error(`Decompression failed for node ${id}: ${err}`);
+  }
```

## Q10 — CLI commands exit with code 1 on error

Files modified (15 commands, 20 error paths):

| File | Paths fixed |
|---|---|
| `bootstrap-docs.ts` | catch block |
| `cohesion.ts` | missing args guard + catch block |
| `context.ts` | missing arg guard + steps.length === 0 guard |
| `diff.ts` | git diff catch + SynapsePersistence type guard |
| `drift.ts` | catch block |
| `entry.ts` | no structural index guard |
| `explain.ts` | missing arg guard + symbol not found + no risk data |
| `fallback.ts` | catch block |
| `impact.ts` | missing arg guard + catch block |
| `link.ts` | missing arg guard + catch block |
| `query.ts` | Oracle catch + Search catch (process.exit placed after listTemplates output) |
| `record.ts` | missing content guard + catch block |
| `rename.ts` | missing args guard + result.success === false path |
| `resonance.ts` | missing arg guard |
| `trace.ts` | missing arg guard + catch block |
| `watch.ts` | watcher null guard |

Pattern applied: wherever `console.error(...)` was followed by `return` (silent failure), replaced `return` with `process.exit(1)`. In catch blocks that only logged, added `process.exit(1)` after the log.

Files NOT modified: `analyze.ts` (already has process.exit(1) on LOCKED), `guard.ts` (already has process.exit(0/1)), `mcp.ts` (no error paths), `status.ts` (errors surface through thrown exceptions to outer handler).

## TypeScript check

```
npx tsc --noEmit 2>&1 | head -20
src/lib/domain/visual/mirror.engine.ts(193,88): error TS2339: Property 'category' does not exist on type 'ConducksEdge<any>'.
```

One pre-existing error in `mirror.engine.ts` — unrelated to wave 4 changes. No new type errors introduced.
