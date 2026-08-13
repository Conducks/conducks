# todo56 — a Node upgrade must not turn `npm i -g conducks` into a 15-minute compile
Status: done
- Acceptance: `npm i -g conducks` completes in under a minute on the current Node major with no C++ toolchain present, and stays that way when the next Node major ships — proven by installing from a packed tarball into a clean prefix, not from the repo.
- Builds: 0027

## Context

Measured on 2026-08-09 by packing the real tarball (`npm pack`, 1.1 MB, 1,395 files) and installing it
into an isolated prefix. On Node 25 the install ran **past ten minutes** and was still compiling
DuckDB from source when it was killed.

`duckdb` installs through `node-pre-gyp install --fallback-to-build`: it downloads a binary matching
this Node's ABI, and compiles from source when none exists. Checked against the host directly:

| Node | ABI | darwin-arm64 | linux-x64 |
|---|---|---|---|
| 20 | 115 | 200 | — |
| 22 | 127 | 200 | 200 |
| 24 | 137 | 200 | 200 |
| **25** | **141** | **404** | — |

So the install is FINE on the Node versions people actually run, and silently awful on whatever major
shipped most recently. This is not a Node 25 special case: `node-pre-gyp` artifacts are ABI-specific,
so it recurs at every Node major until the dependency stops being ABI-bound.

A stopgap already landed: `scripts/check-duckdb-prebuild.mjs` runs as `preinstall` — the one moment
before npm fetches dependencies — and warns with the cost, the toolchain requirement and the way out.
It never fails the install, matching ADR 0027's rule for the tree-sitter binding. `engines` now
declares `node >=20`.

That buys honesty, not speed. Someone on a fresh Node still waits fifteen minutes or fails.

## Phase 1 — move to a NAPI DuckDB

- Builds: 0149
- [x] `@duckdb/node-api` (1.5.5-r.3) is the official NAPI successor — ONE binary serves every Node version and the ABI treadmill ends. Prebuilds confirmed present for all eight triples including musl before committing to it: darwin-{arm64,x64}, linux-{x64,arm64}, linux-{x64,arm64}-musl, win32-{x64,arm64}
- [x] Port the four seams — `openAt`, `query`, `run`, `close`. Row shape verified UNCHANGED by diffing both drivers against this repo's own vault: same columns, same types (BIGINT stays a BigInt in both), same values, via `getRowObjectsJS()`
- [x] The blast radius was NOT one file: `getRawConnection()` hands the driver's connection type to five callers (`cochange-engine`, the structural test, and three diagnostic scripts), all of them callback-shaped. Ported with it
- [x] Read-only/read-write and the lazy reconnect are preserved, and the lock ERROR TEXT is byte-identical across drivers, so `isLockError` and `explainOpenFailure` needed no change (verified cross-process, ADR 0147 / ADR 0040 intact)
- [x] The instance owns the file lock, not the connection — both are held and both are closed, or `compact()` renames a file the process still holds open
- [x] `duckdb`, `scripts/check-duckdb-prebuild.mjs` and its test are deleted: a warning about a compile that can no longer happen is worse than no warning

## Phase 2 — prove the install, don't assume it

- [x] Packed-tarball install into a temp prefix with a clean cache, then `analyze` on a scratch project. **MEASURED on Node 25, darwin-arm64: 43 seconds**, no compiler invoked; installed binary analyzes, reports status and passes `doctor` including the native parser
- [x] It caught a publish blocker on its first run that no test could have: `minimatch` and `chalk` were imported by shipped code and declared nowhere, arriving transitively through `duckdb`. Dropping that dependency took them with it, the repo stayed green, and every real install died on `Cannot find package 'minimatch'`. Both declared, pinned to the versions in use (chalk 4.1.2, minimatch 9.0.9) rather than the majors npm offered
- [x] A static gate now runs at postbuild: `scripts/check-declared-deps.mjs` fails the build when `build/` imports a package that package.json does not declare. Mutation-checked — see `tests/unit/scripts/declared-deps-check.test.ts`, whose three false-positive cases are lines that the first draft wrongly reported
- [-] Automate the tarball install as a suite test — dropped: ~45 s and a network dependency put it outside the gate, and the static check above catches the failure it actually caught. It stays a manual pre-release step, run from this phase's first task
- [x] Run the install on Linux — done on three more triples, each a clean-prefix install from the packed tarball followed by a real `analyze`: **linux-arm64 glibc 38s**, **linux-arm64-musl 38s**, **linux-x64 glibc 47s** (emulated). The musl binding (`@duckdb/node-bindings-linux-arm64-musl`) resolves, which was the prebuild nobody had exercised
- [x] The musl run found something else, and it is not DuckDB: `tree-sitter` cannot build on stock alpine, and since ADR 0089 there is no fallback parse path — so conducks INSTALLS on musl and cannot ANALYZE on it without a toolchain. `doctor` was claiming the opposite ("Analysis still works, at lower fidelity") and is corrected, with a mutation-verified test
- [-] Add the ABI table to the check as VERIFIED data — dropped: the check it belonged to is deleted, and a NAPI binding has no ABI table to keep

## Phase 3 — while in there

- [x] `src/lib/core/persistence/persistence.ts.m` was a stale copy of the persistence layer carrying its own `await this.close()` path, imported by nothing. Deleted with the migration rather than ported
