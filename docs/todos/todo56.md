# todo56 — a Node upgrade must not turn `npm i -g conducks` into a 15-minute compile
Status: todo
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

- [ ] `@duckdb/node-api` (1.5.x) is the official successor and is NAPI-based, so ONE binary serves
      every Node version and the ABI treadmill ends. Confirm it ships prebuilds for darwin-arm64,
      darwin-x64, linux-x64 and linux-arm64 before committing to it.
- [ ] The blast radius is one file: `src/lib/core/persistence/persistence.ts` is the only importer
      (`persistence.ts.m` is a stale backup and should go with it — see Phase 3).
- [ ] The API differs: `duckdb` is callback-based (`db.all(sql, ...params, cb)`), `@duckdb/node-api`
      is promise-based. `query()` and `ensureVaultOpen()` are the seams; everything above them already
      awaits.
- [ ] Keep the read-only/read-write distinction and the lazy reconnect — `query()` reopening through
      `ensureVaultOpen()` is what makes the vault-hold design work (ADR 0147).

## Phase 2 — prove the install, don't assume it

- [ ] A packed-tarball install test: `npm pack`, install into a temp prefix with a clean cache, run
      `conducks analyze` on a scratch project, assert it finishes under a minute. Installing from the
      repo proves nothing — the repo already has `node_modules`.
- [ ] Run it on Linux as well as macOS. The native surface is the one thing that cannot be argued
      about from one platform.
- [ ] Add the ABI table to the check as VERIFIED data when a new prebuild appears, so the warning
      stops firing on a Node that is genuinely fine.

## Phase 3 — while in there

- [ ] `src/lib/core/persistence/persistence.ts.m` is a stale copy of the persistence layer carrying
      its own `await this.close()` path. It is not imported by anything. Delete it with the migration
      rather than porting it — noted, not deleted now, because it is outside this todo's lane.
