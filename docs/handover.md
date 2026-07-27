# Handover — 2026-07-26
Status: current

## Where it stands
- **conducks installs with one command.** `npm i -g conducks` needs no compiler and no build tools:
  all 13 `tree-sitter*` packages are `optionalDependencies`, so npm skips what it cannot build and the
  Gnosis regex extractor carries the analysis where the native binding is absent (ADR 0027). `doctor`
  names which parse path is live. Tarball 22.9 MB → **1.6 MB** unpacked, because the 20 MB of `.wasm`
  it shipped was never loaded by anything.
- **Native is the ONLY parse path.** The WASM half was vestigial: `web-tree-sitter` was never
  installed, four of five grammar-dir paths fed worker payloads nothing read, and the fifth was an
  `existsSync` throw on a file nothing opened. Never value-import an optional dep — CONDUCKS-27.
- **Freshness is a content hash, not a timestamp** (ADR 0030). A `file_hashes` table gates every
  incremental re-parse: **0.7ms** to ask against **236ms** of work skipped, measured on a 1200-file
  repo. Every unknown resolves to "changed", so the gate costs time and never correctness.
- **One monitor over every project** (ADR 0031). `conducks setup` records the root in
  `~/.conducks/projects.json`; `conducks monitor` reports per project whether the graph is behind the
  code (which files, which modules), whether the docs break their grammar, and which architecture
  notes describe changed code. Report only, exits 0 — CONDUCKS-29.
- **A changed module flags its `MODULE.md`**, and the dismissal is bound to the code it was checked
  against, so it expires when the module moves again. `--dismiss` = still accurate;
  `--dismiss --intent <adr|todo|path>` for an enhancement, and the address is verified to exist.
  Drifted notes also surface on the docs board, not only in the new command.
- **The vault's concurrency limit is measured, not assumed** (ADR 0032): N agents read one vault fine
  (6 in parallel, 6-8ms each), but while a pulse WRITES it every read **fails rather than queues**.
  The `[code layer]` tool tag says so, and the lock error now explains itself once instead of dumping
  DuckDB's wall of text three times. During a pulse, `conducks_docs` is the only surface that works.
- **DAAC is gone** (ADR 0028) — not as unwired code but as code that never worked: it looked up edges
  by file path in a graph keyed by node id, so it returned 501 clusters for 501 files. Its archived
  test was GREEN because the fixture set `id` equal to `filePath`. That trap is CONDUCKS-28.
- **Skills are global only** (ADR 0029). A repo-local copy is a duplicate Claude Code also discovers,
  so all four were loading twice; `sync()` prunes one and leaves foreign skills alone.
- **The docs gate runs itself** — `scripts/hooks/pre-commit` via `core.hooksPath` (`npm run hooks`),
  skipped unless a `docs/*.md` is staged. Verified: it aborts a commit on a violation.
- **`tests/legacy/` is cleared.** All 77 files were triaged by RUNNING them: 17 passed, and the 7 that
  covered subjects with no other test were ported. Suite **186 → 273 tests**.
- Gates: **273 tests** · typecheck 0 · `docs-lint` clean (45 governed docs) · board reports
  **0 hygiene warnings** · 11 ADRs with no build link (pre-existing; they predate the link fields).

## Next, in order
1. **PUBLISH — yours to run, deliberately.** Everything it gates is green: tarball verified to carry no
   docs (`npm pack --dry-run | grep -c docs/` = 0), `repository`/`homepage`/`bugs` added, `doctor`
   honest about the parse path. The name `conducks` is still free (404 on 2026-07-26).
   ```
   npm publish --tag next          # reserves the name; `npm i -g conducks` still resolves to nothing
   npm publish                     # then latest, when you are ready for real installs
   ```
   Then cut a matching GitHub release — until one exists the update notice reports "no release
   published yet", which is correct but untested against a real tag. See `todo16#P3`.
2. **Delete the archived legacy suite.** It was MOVED, not erased, because `rm -rf` is blocked in this
   session's sandbox — and it was untracked and gitignored, so git cannot restore it:
   `rm -rf "/private/tmp/claude-501/-Users-saidmustafasaid-Documents-Gospel-Of-Technology-CONDUCKS/2cfa8148-8594-4d7c-89e0-641b2043dcb7/scratchpad/legacy-removed-2026-07-26"`
   Do it once you are satisfied with the 7 ported suites.
3. **todo10#P2 / todo10#P4** and **todo03** are the remaining decision-linked work.
4. **Scratch artefacts from this session** live in the same scratchpad: a synthetic 1200-file repo
   (`bigrepo/`) used for the hash-gate measurement, and the probe scripts behind every number quoted
   in ADRs 0028 and 0030-0032. Disposable — the numbers are recorded in the ADRs and `memory.md`.

## Two things a reader should not have to rediscover
- **The mirror's Docs panel has no automated coverage, on purpose.** It was verified by driving the real
  `ui.js` against the live `/api/docs` on a throwaway DOM shim (174 nodes rendered). The shim was NOT
  kept: a hand-written `document` stub is the same fixture-shaped-to-the-code trap as the DAAC test.
  Changing `loadDocs` needs a real browser. See `memory.md`.
- **`nodes.fingerprint` cannot answer "did this file change"** — it is a per-SYMBOL hash. File-level
  freshness is the separate `file_hashes` table, and a purge of a file's nodes must drop its hash too
  or the file is skipped forever with no nodes. `purgeUnits` now does.
