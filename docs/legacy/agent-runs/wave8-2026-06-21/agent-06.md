# Agent 06 — DF3: Blueprint Diff (Wave 8)

## Task
Add architecture drift tracking to the blueprint generator: snapshot saving, loading, and diffing.

## Files Changed

### `src/lib/domain/governance/blueprint-generator.ts`
- Added `BlueprintDiff` interface (exported) with fields: `nodesAdded`, `nodesRemoved`, `rankViolationsAdded`, `rankViolationsRemoved`, `newCycles`, `resolvedCycles`.
- Added `saveSnapshot(pulseId, blueprint)` — writes JSON to `.conducks/blueprints/<pulseId>.json`, creating the directory if needed.
- Added `loadSnapshot(snapshotRef)` — loads by pulseId or by `HEAD~N` offset (sorted descending by filename). Returns `null` if not found.
- Added `diffSnapshots(snapshotA, snapshotB)` — compares node sets, rankViolation sets, and cycle arrays (cycle equality by sorted member join). Returns `BlueprintDiff`.

### `src/interfaces/cli/commands/blueprint.ts`
- Added `--save` flag: after generation, serialises graph nodes + cycles into a snapshot and saves it with a timestamp pulseId.
- Added `--diff <ref>` flag: loads snapshot at ref, diffs against current, prints a summary table.
- Updated `usage` string to document flags.

## Verification
`npx tsc --noEmit` — zero errors, zero warnings.

## Notes
- Snapshot format is `{ nodes: string[], cycles: string[][] }`. The `rankViolations` field in the diff compares `snapshot.rankViolations` arrays — currently always empty since the CLI does not populate them in the snapshot. Callers can extend the snapshot object to include violations before saving.
- `HEAD~0` would be the most recent snapshot (index 0 in descending sort), `HEAD~1` the second most recent, etc.
