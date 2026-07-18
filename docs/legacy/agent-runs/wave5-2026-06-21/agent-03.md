# Wave 5 — Agent 03 — Q12: manifest-engine.ts filesystem writes

**Task:** Q12 — Remove filesystem writes from `ManifestEngine` (domain analytics service); move I/O to the service layer.

**Status:** COMPLETE — `npx tsc --noEmit` exits clean (no output).

---

## What was wrong

`ManifestEngine` performed `fs.mkdir`, `fs.writeFile`, and `fs.appendFile` directly inside a domain engine typed as `analyzer`. This mixed computation with persistence, violating the read-only analytics boundary.

## What changed

### `src/lib/domain/manifest/manifest-engine.ts`
- Removed `import fs from "node:fs/promises"` — no more I/O.
- Replaced `bootstrap()` with `computeBootstrap()` — returns `ManifestFile[]` (path + content per file, no writes).
- Replaced `record()` with `computeRecord()` — returns `ManifestRecord` (paths + append/initial content, no writes).
- Exported `ManifestFile` and `ManifestRecord` interfaces.

### `src/lib/domain/manifest/index.ts`
- Added `import fs` and `import path` — `ManifestService` now owns all I/O.
- `bootstrap()` calls `engine.computeBootstrap()`, does `fs.mkdir` + `fs.writeFile` for missing files.
- `record()` calls `engine.computeRecord()`, does `fs.mkdir` + `fs.appendFile` (or `writeFile` on first create).
- Public API (`bootstrap`, `record`) unchanged — all callers unaffected.

## Callers verified (no changes needed)

- `src/interfaces/cli/commands/bootstrap-docs.ts` — calls `registry.status.bootstrap` → `ManifestService.bootstrap` — unchanged interface.
- `src/interfaces/cli/commands/record.ts` — calls `registry.status.record` → `ManifestService.record` — unchanged interface.
- `src/registry/index.ts` — wires `ManifestService` — no change needed.
