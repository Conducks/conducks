# 0062 — a fresh clone must fail loudly or degrade loudly, never silently

Status: Accepted
- Enforced by: `scripts/check-native-parser.test.mjs`, `scripts/check-build-aliases.mjs` (self-verified
  against a crafted fixture, see Consequences — neither is wired into `npm test`, see Consequences)
- Date: 2026-07-31

## Context

todo27 measured a fresh clone of conducks — `git clone && npm install && npm test`, nothing else run
first — going from 751 passing to **215 failed / 33 suites**, recovered only by three undocumented
interventions (install `tree-sitter` by hand, rebuild, run `conducks analyze`). Three unrelated code
paths produced that number, and they share one root cause: each one reports success (exit 0, a
`build/` directory, a green `npm install`) on an outcome that was actually degraded, broken, or
simply not yet done.

1. **`tree-sitter` (the native parser runtime) is an `optionalDependency` (ADR 0027).** That decision
   was deliberate and correct — it is what lets `npm install` succeed with no C++ toolchain present.
   But nothing said so out loud. `npm install` printed nothing when it skipped the binding, and
   analysis then silently ran through the Gnosis regex fallback for every language. MEASURED
   (todo27): the PHP suite went from 8 expected symbols to 1. `conducks doctor` already reports this
   correctly (`Parse path: Gnosis regex fallback — the native tree-sitter binding did not load`) —
   the diagnosis exists, but nobody runs `doctor` before hitting the degraded result on a first
   install.

2. **A partial `tsc` compile still produces a `build/` directory.** When `tree-sitter` was absent,
   `tsc` failed partway through the build script's chain (`tsc && tsc-alias && ...`), so `tsc-alias`
   never ran on the files that failed to transpile — but the files that DID transpile were already on
   disk, so `build/` existed and looked complete. MEASURED (todo27): 16 files carried an unresolved
   `@/` import. Every integration test then died on
   `Cannot find package '@/registry' imported from build/src/interfaces/cli/index.js`, which names
   the symptom (a package that does not exist) and not the cause (a build that never finished).

3. **`tests/database/ts/structural.test.ts` opens the repository's own live vault, read-only, and
   audits it** (todo25#P5 — deliberately the real vault, not a fixture, because a fixture would defeat
   the point of the audit). On a fresh clone `.conducks/conducks-synapse.db` does not exist yet, and
   DuckDB's read-only open throws `IO Error: ... database does not exist` — MEASURED directly against
   an isolated fixture directory (not the shared vault) to confirm the exact error shape without
   touching a vault other agents were using. `beforeAll` did not catch this, so all four tests in the
   suite failed before the code under test ran at all — CI was red before anyone had written a line.

## Decision

**A step that can degrade or has not run yet says so at the moment it happens, using the words a
person would use to fix it — never a downstream stack trace that names the symptom.** Three
instruments, one per case above, all landing in this change:

1. **`scripts/check-native-parser.mjs`, wired as `"postinstall"` in `package.json`.** Tries a real
   `require('tree-sitter')` and prints a warning naming `tree-sitter` and the fix (install a C++
   toolchain, reinstall) when it fails. Always exits 0 — it must never turn `npm install` into a hard
   failure, because doing so would undo exactly what ADR 0027 fixed (an install that requires a
   compiler on every machine). `tree-sitter` STAYS an `optionalDependency`; see "Rejected" below for
   why moving it to `dependencies` was considered and turned down.

2. **`scripts/check-build-aliases.mjs`, appended to the end of the `"build"` script.** Walks `build/`
   for any `.js` file whose import/require specifier still starts with `@/` and exits 1, naming every
   offending file, if it finds one. `npm run build` now refuses to leave behind a `build/` that looks
   finished and is not.

3. **`tests/database/ts/structural.test.ts` checks `fs.existsSync()` on the vault DB file before
   opening it.** Absent → every test in the suite runs through `it.skip` with the reason logged in
   `beforeAll` ("no vault yet, expected on a fresh clone"). Present but unopenable for any other
   reason (locked, corrupt) → `beforeAll` still throws exactly as it did before this change. The two
   cases must not report identically (CONDUCKS-13 / ADR 0048): "nothing to audit yet" and "the audit
   broke" are different facts, and collapsing them either into a permanent red (the old behaviour) or
   into a check that always passes (a check that never opens the DB at all) would each throw away one
   of the two.

**Rejected: moving `tree-sitter` from `optionalDependencies` to `dependencies`.** The asymmetry named
in todo27 is real — a missing Rust grammar costs Rust support, a missing native runtime costs every
language at once — but the fix for an asymmetric cost is not to make both mandatory. `tree-sitter`
ships no prebuilds at any version (ADR 0027), so making it a hard dependency reopens the exact problem
0027 fixed: `npm install` fails outright on any machine without a C++ toolchain, which is a worse
first-run experience than a loud warning on a degraded-but-working install. The postinstall warning
gets the asymmetry its due weight — it is the one degrade that gets a proactive, unsolicited message
— without reintroducing a hard install requirement.

**Rejected: failing the install outright when the binding is missing.** Same reasoning: it would make
a currently-working (if degraded) install into a hard failure for anyone without a compiler, which is
strictly worse for the "clone and go" case this whole todo is about.

**Rejected: `structural.test.ts` builds its own fixture vault.** The suite's stated purpose
(todo25#P5) is to audit THIS project's real analysis output — dangling edges, shadow symbols, orphan
counts in the actual graph conducks produces of itself. A synthetic fixture vault would pass or fail
on data nobody cares about; it stops being the audit it was written to be. Skipping with a named
reason preserves what the suite exists to check while no longer treating "nobody has run `analyze`
yet" as a failure.

## Consequences

`npm run build` now takes one extra directory walk (milliseconds on this repo's `build/`, ~2,800
files) before it can report success — a fair price for not shipping a `build/` that lies about being
complete.

**Verification performed, and what is NOT wired into the automated suite:**
- `scripts/check-native-parser.test.mjs` and `scripts/check-build-aliases.mjs` are plain Node scripts,
  run manually (`node scripts/<file>`), not Jest specs — this agent's file lane for this change did
  not include adding new files under `tests/`, and Jest's `testMatch` (`jest.config.js`) only picks up
  `tests/**/*.test.ts` regardless. Both were run and passed during this change; neither runs
  automatically on `npm test`. Wiring them into CI (a `pretest` script, or a `tests/` `.test.ts`
  wrapper that shells out to them) is not done here.
- `check-build-aliases.mjs`'s detector was verified against a crafted fixture directory containing one
  file with a bare `@/` import and one clean file: it flagged exactly the offending file. It was also
  run against the real, currently-clean `build/` and reported zero offenders.
- The `structural.test.ts` skip path was verified by reproducing the exact DuckDB error
  (`database does not exist`) against an isolated fixture directory outside the shared vault, and by
  static review of the `it.skip` gate — this repo's standing multi-agent rules for this change forbid
  running any test under `tests/database/`, so the fixed suite itself was not executed end-to-end by
  this agent. `npx tsc --noEmit` passes clean including this file.

`Open:` whether the two new scripts should be promoted into the Jest suite (so `npm test` alone proves
them, instead of relying on someone remembering to run them by hand) is not decided here. No todo
carries this yet.
