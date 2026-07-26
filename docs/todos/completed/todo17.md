# todo17 — always-on monitoring, across every project that uses conducks

Status: done
- Acceptance: saving a file updates that file's nodes in the graph within a second without a full pulse, and one monitor reports every registered project whose graph, docs or architecture has fallen behind its code

A graph used to be only as fresh as the last manual `conducks analyze`, and each project was an island:
nothing knew which projects existed, which were stale, or which had code change under an architecture
note that still described the old shape.

## Phase 1 — incremental, hash-gated file watching
- Builds: 0030
- [x] every analyzed file is hashed into a `file_hashes` table `(file, hash, sizeBytes, updatedAt)` in the DuckDB vault, keyed by lowercased absolute path. NOT `nodes.fingerprint`: that is a per-SYMBOL hash of `path|name|dna`, so a file with no symbols has none and a comment-only edit changes none of them while still needing a re-parse
- [x] `FileHashGate` (`src/lib/core/persistence/file-hash-gate.ts`) gates the watcher: `ConducksWatcher.handlePulseEvent` compares before the git subprocess, the grammar load, the parse and the global re-link. The todo's premise was wrong here — the watcher does NOT call `MicroPulseService`; it calls `graph.pulseStructuralStream` directly, and `MicroPulseService` is the MCP `pulse` action's path
- [x] every unknown resolves to CHANGED — no stored hash, unreadable vault, thrown error. The gate may cost time and never correctness: a wrongly skipped file is a silently stale graph, a wrongly parsed one costs 236ms. The hash is recorded AFTER the parse succeeds, never before
- [x] a completed full pulse seeds the table for every file it analyzed, so the gate pays off from the first save rather than the second. An INCOMPLETE pulse deliberately seeds nothing — marking files analyzed that never were would skip them forever
- [x] measured on a synthetic 1200-file / 13,244-node repo: verdict **0.7ms cold**, **0.007ms warm** (in-process cache), against **236ms** for the parse-and-relink skipped — **331x**. On conducks itself 200 unchanged saves were dismissed in 27ms. Recorded in `docs/memory.md`

## Phase 2 — the monitor, across projects
- Builds: 0031
- [x] `~/.conducks/projects.json` written by `conducks setup` (`ProjectRegistry`, `src/lib/domain/federation/project-registry.ts`). Idempotent, versioned, pretty-printed for hand-editing; a missing or corrupt file reads as "no projects". Same machine home as the update notice
- [x] `conducks monitor` reports per project: graph freshness as changed / new / gone (from the hashes, not a timestamp — a timestamp cannot say WHICH files), docs violations and warnings via `buildBoard`, and which modules changed. Each vault opened READ_ONLY; an unreadable project becomes a line, not an exception
- [x] report only — exits 0 with everything stale, writes to no vault, edits no doc. `--dismiss` is the single write
- [x] verified on two registered projects: it named exactly the five modules touched in this session, each against its own `MODULE.md`. THREE defects found and fixed by running it: a false "1 gone" (a set difference counted every non-source file the pulse had hashed), a leaked `fatal: not a git repository` from the non-git fallback, and — the one that mattered — "graph behind" reported immediately after a successful full pulse
- [x] `added` is COVERAGE, not staleness. `analyze` is incremental by mtime (`domain/analysis/index.ts:87`), so a file untouched since the last pulse never enters a wave and never gets a hash: 46 such files on conducks, mostly `scripts/`. `stale` is now `changed + removed`, and the never-analyzed count is reported on its own line with `--force` as the remedy. A staleness claim the reader cannot act on trains them to ignore the line

## Phase 3 — code change implies a doc check
- Builds: 0031
- [x] a changed module flags `docs/architecture/modules/<path>/MODULE.md`, resolved by walking up from the changed directory so a leaf file still finds its note
- [x] `conducks monitor --dismiss <module>` = "checked, still accurate", bound to the combined hash of the module's files. Verified: the flag clears, RETURNS when the module changes again, and clears once more when the change is reverted — a dismissal is a statement about a version of the code, not a mute button
- [x] `--dismiss <module> --intent <adr|todo|path>` for an enhancement, and the address is VERIFIED to exist before it is stored (`0027` → a file in `docs/decisions/`, `todo17` / `todo17#P3` → `docs/todos/`, anything else → a path). `--intent 9999` is refused with the reason
- [x] surfaced through the docs board, not only the new command: `conducks docs-status` and `conducks_docs` (`health.staleModuleNotes`) list notes reviewed and since drifted, computed from `.conducks/doc-reviews.json` plus file hashes — no DuckDB, no anchor, so CONDUCKS-24 holds. Only modules with a recorded review appear, so a first run is not noise
- [x] found a real bug in my own first version doing this: `statSyncSafe` in `docs-board.ts:319` answers `isDirectory()`, so using it on `MODULE.md` was always false and the section silently never rendered. Now `existsSync`

## Phase 4 — several agents on one MCP server
- Depends: todo17#P1
- Builds: 0032
- [x] measured instead of designed, and the answer inverted the plan: **N concurrent readers already work** — 6 agents queried one vault in parallel, 6-8ms each. What breaks is a writer: while any writer holds the vault, a second writer AND a plain reader both fail immediately with `IO Error: Could not set lock on file`. DuckDB's lock is exclusive for the whole file, so a read does not queue behind a pulse, it FAILS
- [x] so no queue and no pool were built — there is no reader contention to solve. The limit is STATED where an agent reads it: the `[code layer]` tool tag now says concurrent reads are safe, a running pulse makes reads fail rather than queue, and `conducks_docs` keeps working meanwhile
- [x] writes stay single and already failed loudly. The lock error is now explained once instead of dumping DuckDB's wall of text three times: which process holds it, that it is almost always `conducks analyze`, and that docs-layer tools are unaffected
- [x] confirmed the docs layer really is immune — `conducks docs-lint` ran clean while a writer held the vault, and `conducks status` failed. That makes ADR 0023's split stronger than it claimed: a docs call is the ONLY kind that works during a pulse

## Follow-ups this work surfaced
- [x] `conducks monitor` still pays `registry.initialize()` (`src/interfaces/cli/index.ts:120`), booting grammars and anchoring a vault it never opens — `docs-status` and `docs-lint` too. Handed to **todo19** rather than fixed here: it changes which commands boot the registry, which is the CLI's init contract and not this feature's business
- [x] FIXED rather than deferred, since the hash gate created the coupling: `purgeUnits` now deletes the `file_hashes` rows of the units it drops, inside the same transaction and BEFORE the nodes go, while the subquery can still resolve their paths. Leaving a hash behind would make a purged file look analyzed to the gate and be skipped forever with no nodes at all
