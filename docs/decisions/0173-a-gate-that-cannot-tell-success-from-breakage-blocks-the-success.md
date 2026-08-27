# 0173 — a gate that cannot tell success from breakage blocks the success
Status: Accepted
- Date: 2026-08-27
- Builds: 0172
- Enforced by: tools/benchmark/oracle-tsc.mjs

## Context

Pointing `prune` at conducks itself reported **29 stale imports in its own source**, 26 of them in
`src/lib`. `oracle:imports` confirmed every one — EXTRA 0 against `tsc --noUnusedLocals` — so they
were real, and deleting an unused import is the safest edit there is.

Deleting them broke two gates in the oracle that had just certified them.

- **The liveness guard.** `if (oracle.size === 0) → fail`, on the reasoning that tsc finding nothing
  means tsc did not run. True for a project with stale imports; false the moment the project is
  clean. *"The project is clean"* and *"the instrument is broken"* produce the identical empty
  result.
- **The ratchet.** `oracle.size < prev.oracle * 0.5 → fail`, worded "treat that as the oracle
  breaking, not the project improving". 28 → 0 is exactly the shape it refuses, and this time the
  project really had improved.

Both were correct guards with no way to tell the two cases apart, so they blocked the good one.

## Decision

**Ask the instrument, rather than inferring from the number.**

`probeDetectsPlantedImport()` writes one unused in-project import, re-runs the oracle, requires it to
be found, and deletes the probe in a `finally`. A passing probe proves the instrument works, so zero
is the truth; a failing probe proves it does not, so zero means nothing.

Both guards now consult it. Neither fires on a low count alone — only on a low count the instrument
cannot explain. It runs only when a guard would otherwise fire, so a project with findings pays
nothing.

## Consequences

- All 29 stale imports are gone from conducks' own source, across 20 files, and the typecheck error
  count is **6 before and 6 after** — every one of them pre-existing and in `tests/`.
- `oracle:imports` now reports `0 → 0 missed` and prints why the zero is trustworthy.
- **The probe had to be written twice.** The first version imported `node:fs`, which this oracle
  filters out as external — so it reported a working instrument as broken. An instrument check that
  is itself wrong is worse than none, because it fails in the direction that looks like rigour.
- **A flag was being read as a path.** Every oracle took `process.argv[2]` positionally, so
  `npm run oracle:imports -- --write-baseline` resolved `--write-baseline` as the project directory
  and died with `spawnSync node ENOENT`, naming neither. Fixed in all four.
- Full gate green: six oracles, 319 suites / 2,469 tests.

**The general point.** A guard against an instrument degrading silently will, at some point, meet the
success it was built to distinguish from failure — and cannot. The fix is never a looser threshold;
it is a positive control, so the gate stops guessing from a number and asks a question with an
answer.
