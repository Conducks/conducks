# 0169 — Python dead code gets an oracle
Status: Accepted
- Date: 2026-08-27
- Builds: 0167
- Enforced by: tools/benchmark/oracle-python-dead.mjs

## Context

TypeScript had an independent check for every verdict `prune` makes. Python had one for exactly one
of them.

| language | STALE_IMPORT | UNUSED_EXPORT | ORPHAN |
|---|---|---|---|
| TypeScript | `tsc --noUnusedLocals` | LanguageService references | LanguageService references |
| Python | `ast` | *(no such concept)* | **nothing** |

`oracle-python.mjs` line 148 reads `if (f.type !== 'STALE_IMPORT') continue;`, so every Python ORPHAN
was resting on hand-reading — the same method that missed all eight namespace-import false positives
two days earlier.

That is the wrong place to have the gap. **Three of the four defects found on 2026-08-27 were
Python**, and the largest of them was an ORPHAN defect: `from pkg import module` bound nothing, so
`page_source.capture_dom(...)` resolved against the package and eight live functions read as dead. It
was caught by refreshing the subject, not by a check. Nothing would have caught the next one.

## Decision

**`oracle-python-dead.mjs` scores `ORPHAN` and `ONLY_IMPORTED` against Python's own `ast`.**

The walk collects every module-level definition and every reference — `Name` loads, `Attribute`
access, and identifier-shaped string constants, which is how `__all__` names a symbol. A symbol
referenced anywhere contradicts a claim that nothing references it.

Three decisions make it score the claim `prune` actually makes rather than a stricter one:

- **A recursive call is not a caller.** References inside a definition's own line span are excluded,
  or every recursive function would contradict its own ORPHAN.
- **EXTRA is scored only on `ORPHAN` and `ONLY_IMPORTED`.** `UNIMPORTED_MODULE` claims something
  else — that nothing imports the FILE — and a reference to the symbol does not contradict it.
- **But `UNIMPORTED_MODULE` still counts as prune having SPOKEN.** Conflating those two questions
  invented a recall gap on the first run: `Hierarchy` was reported `UNIMPORTED_MODULE` and counted as
  silence.

Recall is a proxy and is labelled as one. The walk models two of prune's exemptions — a decorated
symbol may be handed to a registry, and a file with an `if __name__` block is an entry point — and no
others, so `MISSED` ratchets rather than being required to reach zero.

## Consequences

- Measured on scraper: **1,441 module-level definitions walked, 12 dead-code verdicts, 0 missed,
  0 extra.** On sofie's Python: 75 definitions, 0 and 0. Both baselines recorded deliberately.
- **The oracle is proved by catching the defect it was built for.** Reverting ADR 0167's module
  binding makes it report **8 EXTRA** and exit non-zero, naming each symbol with its reference count
  — `navigate` 14, `discover_next_button` 11, `augment` 7. An oracle that has never caught anything
  is a claim, not an instrument.
- Every verdict `prune` makes now has an independent checker on both benchmarked languages. The only
  category still unscored is `UNIMPORTED_MODULE` on Python, which is a question rather than a verdict.
- **OPEN QUESTION — the word `oracle` now means two opposite things in this repository, and that is
  a hazard rather than a nuisance.** The PRODUCT has Oracle SQL templates (`find_usages`, `hotspots`,
  `dead_code`, `cycles`, `entry_points` in `query-service.ts`): canned queries that read the conducks
  graph, ship to users, and therefore inherit every blind spot the graph has. The BENCHMARK oracles
  are the inverse by construction — they must never touch that graph, because an instrument built
  from the thing it measures agrees by construction and proves nothing.

  So one meaning TRUSTS the graph and the other REFUSES to, and `dead_code` versus
  `oracle-python-dead.mjs` is the pair a reader is most likely to confuse.

  Not resolved here. The fix is to rename the TEST side — `ground-truth-*` or `verify-*` — because it
  is not user-facing and nothing outside `package.json` scripts cites it, while the product name is
  public. Deferred to whenever `query`'s templates are next worked on, so the rename lands beside the
  code that owns the surviving meaning rather than as a drive-by.

- `npm run oracle:python-dead` runs it. It resets the vault and re-analyzes first, for the reason
  `oracle-python.mjs` already records: a grammar change alters no file hash, so a stale vault scores
  the previous build and reports success.
