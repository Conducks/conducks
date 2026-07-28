# Handover — 2026-07-28
Status: current

## Where it stands
- **The layer contract is enforced for the first time.** `conducks guard` had detected 3 illegal
  pairs for months and nothing ran it. The edges are routed through `registry`, and CI runs guard
  and `docs-lint` after `analyze`. Test files sit outside the contract on purpose.
- **The vault reclaims itself** (ADR 0037). DuckDB never returns deleted row versions; this repo's
  vault held 8.76 MB of rows in 235 MB. `analyze` now rewrites and swaps when `bloatRatio()` says it
  pays: **235.3 MB → 12.8 MB** in 100 ms, and the next pulse correctly declines.
- **The graph loads only when something walks it** (ADR 0038). Per session: docs-only 92 MB, filter
  query 109 MB, `conducks_status` 104 MB — against 435 MB for everything before. Forgetting is loud
  by design: a deferred graph reads as an EMPTY one, and opt-in cost 3 silently-wrong tools.
- **`conducks_status` can report a stale index again.** `load()` never restored the metadata TABLE,
  so `lastAnalyzedCommit` was undefined and staleness computed against `"none"` — always false, in
  every read-only process. `statusFromVault()` reads the table; in-memory `status()` is still wrong.
- **The remaining memory is not a data-structure problem.** After a load heap is 53 MB; after two
  forced GCs, 21 MB, with RSS unmoved at 199 MB. The graph retains 21 MB, the rest is V8 arena. The
  typed-array rewrite was dropped on that measurement rather than argued about.
- Gates: **583 tests** · typecheck 0 · `guard` clean · `docs-lint` clean (48 governed docs) · one
  hygiene warning, which is correct (`todo07` is wholly deferred).

## Next, in order
1. **`todo21#P1`** — line-level updates. A one-line edit costs **~1.0 s** over a 369 ms unchanged
   pulse, measured; that is the number to beat. It also stops the vault churn at source, so it
   closes ADR 0037's last task and unblocks `#P3`. `todo21#P0` is 4/6 and no longer blocking.
2. **`todo21#P1`** — line-level updates. It stops the vault churn at source, so it closes ADR 0037's
   last task as well as unblocking `#P3`.
3. **`todo22#P2`/`#P3`** — two rule engines share the name "sentinel", and ~58 findings fire
   untriaged. Cheap, independent, nothing gates it.
4. **PUBLISH — still yours to run** (`todo16`, deferred to you 2026-07-26). Everything it gates is green.
