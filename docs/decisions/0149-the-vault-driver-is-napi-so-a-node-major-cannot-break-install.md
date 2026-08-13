# 0149 — The vault driver is NAPI, so a Node major cannot break the install
Status: Accepted
- Enforced by: tests/unit/core/persistence/vault-driver-is-napi.test.ts (mutation-verified: re-adding `duckdb` to dependencies fails it)
- Date: 2026-08-10

## Context

`npm i -g conducks` on Node 25 ran past ten minutes and was still compiling DuckDB from source when it
was killed. Measured by packing the real tarball and installing it into an isolated prefix, not from
the repo — the repo already has `node_modules` and proves nothing.

`duckdb` installs through `node-pre-gyp install --fallback-to-build`: it downloads a binary built for
THIS Node's ABI and compiles from source when none exists. Checked against `npm.duckdb.org` for duckdb
1.4.4: Node 20/22/24 (ABI 115/127/137) return 200 for darwin-arm64 and linux-x64; Node 25 (ABI 141)
returns 404.

So the install was fine on the Node versions people run and silently awful on whatever major shipped
most recently. Not a Node 25 special case: node-pre-gyp artifacts are ABI-specific, so it recurs at
every Node major, and the failure lands on exactly the users who upgrade early — after ten minutes,
with no toolchain, having been told nothing.

## Decision

The vault opens through `@duckdb/node-api` (1.5.5-r.3), the official NAPI successor. NAPI is
ABI-stable, so ONE prebuilt binary serves every Node version and the treadmill ends. Prebuilds were
confirmed present before committing to it, for all eight platform triples including musl:
darwin-{arm64,x64}, linux-{x64,arm64}, linux-{x64,arm64}-musl, win32-{x64,arm64}.

MEASURED after the swap, Node 25, clean prefix, cold cache: **43 seconds**, no compiler invoked. The
installed binary then analyzes, reports status, and passes `doctor` including the native parser.

**Not chosen: keep `duckdb` and warn at preinstall.** That was the stopgap already in the tree —
`scripts/check-duckdb-prebuild.mjs`, an ABI table and a warning that never failed the install. It
bought honesty, not speed: the user still waited fifteen minutes or failed, having been told the cost
in advance. It also had to be RIGHT about a table of ABIs that changes whenever DuckDB publishes a new
prebuild, so its accuracy decayed on somebody else's release schedule. The script is deleted with this
change; a warning about a compile that can no longer happen is worse than no warning.

**Not chosen: pin `engines` to the Node majors with prebuilds.** It converts a slow install into a
refused one and still breaks at the next major, so it moves the failure without removing it.

## Consequences

The driver is promise-based where the old one took callbacks, so `query()`, `run()` and
`ensureVaultOpen()` — the seams everything above already awaited — carry the whole port. Row shape is
UNCHANGED: the old and new drivers were diffed against this repo's own vault, same columns, same
types (BIGINT stays a BigInt in both), same values, by reading through `getRowObjectsJS()`. The
callback driver's `getRowObjects()` equivalent hands back DuckDB value wrappers instead; using it
would have silently changed every timestamp into an object.

Two behaviours changed, both improvements, both load-bearing:

- **`close()` cannot hang, so the 5-second timeout race is gone.** The old driver's close took a
  callback that might never fire; the timer guarding it kept the event loop alive for the full five
  seconds on every command that opened a vault (`conducks query` answered at 451 ms and exited at
  5.5 s). `closeSync` is synchronous.
- **A clean close now CHECKPOINTS the write-ahead log away.** A `.wal` beside the vault after a
  well-behaved shutdown no longer exists, so a stale log is now strictly the signature of a crash —
  which is what ADR 0037 and ADR 0040 always meant by one. The reader-snapshot test used to
  manufacture a stale log by closing a donor vault; it now copies the log mid-session, before the
  close that would checkpoint it.

The instance and the connection are separate objects and the INSTANCE owns the file lock. Both are
held and both are closed — closing only the connection leaves the vault locked, which would break
`compact()`'s close-then-rename and every reader after it.

The enforcing test checks the MANIFEST, not behaviour, and that is not a shortcut. No functional test
can tell the two drivers apart — the persistence suite passes against either, which is the point of
the port having been behind the seams. What this decision claims is a property of what gets
INSTALLED, so what guards it is that `duckdb` is not declared and nothing imports it. The honest full
test packs a tarball and installs it into a clean prefix; that needs a network and ~45 seconds, so it
stays a manual pre-release step (todo56#P2).

Verified on four platform triples, each a packed-tarball install into a clean prefix with a cold
cache, followed by a real `analyze`:

| platform | Node | install | analyze |
|---|---|---|---|
| darwin-arm64 | 25.8.0 | 39s | ok |
| linux-arm64 (glibc) | 24.19.0 | 38s | ok |
| linux-arm64-musl (alpine) | 24.19.0 | 38s | **refused — see below** |
| linux-x64 (glibc, emulated) | 24.19.0 | 47s | ok |

The musl row is not a DuckDB failure and not a regression: `@duckdb/node-bindings-linux-arm64-musl`
resolved and `doctor` reported the binding loadable. What is missing there is `tree-sitter`, which
compiles from source and cannot build on a stock alpine image — and since ADR 0089 there is no
fallback parse path, so `analyze` refuses. **Conducks installs on musl and cannot analyze on it
without a toolchain.** That was true before this change and is now measured; `doctor` was corrected in
the same turn, because it had been claiming the deleted fallback still covered exactly this case.
