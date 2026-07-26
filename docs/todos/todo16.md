# todo16 — make conducks installable: one command, no build chain

Status: doing
- Acceptance: `npm i -g conducks` succeeds on a clean machine with no compiler flags and no build tools, and `conducks analyze .` works immediately afterwards

Conducks is meant to be a platform every project uses, but installing it meant cloning the repo and
hand-editing an absolute path into an MCP config. The npm name `conducks` is FREE and NOT yet claimed
(checked 2026-07-26: registry returns 404); what stood between it and a real release was the
dependency chain, not the registry.

**Phases 1 and 2 are done and the acceptance criterion is met in code** — the install needs no
compiler and no build tools, and degrades to the Gnosis extractor where the native binding cannot be
built (ADR 0027). What remains is the publish itself, which is Said's to run.

## Phase 1 — settle the grammar path
- Builds: 0027
- [x] measured, and the premise was INVERTED: NATIVE is the only parse path and the WASM half was never loaded. `web-tree-sitter` was not a dependency; four of the five grammar-dir paths fed worker payloads nothing read (`pulse-worker.ts:27` destructured `resourceDir` and used it nowhere), and the fifth was an `existsSync` throw on a file nothing opened. A pulse with the native binding HIDDEN still analyzed — 25 nodes/32 edges via the Gnosis regex fallback against native's 26/27 on the same fixture
- [x] moved all 13 `tree-sitter*` entries to `optionalDependencies` — NOT `devDependencies`, they are the runtime path. The core package ships no prebuilds at any version, so it compiles at install and is absent without a C++ toolchain; optional means npm skips it instead of failing the install. Authoritative path recorded in `docs/memory.md`
- [x] `src/resources/grammars/` DELETED, neither shipped nor downloaded — nothing loaded it. Tarball 22.9 MB → 1.6 MB unpacked (411 kB packed, 686 files)
- [x] made the degrade safe: every binding use goes through `GrammarRegistry.loadNative()` (lazy `require` in a `try/catch`), and the value import of `tree-sitter` in 13 files became `import type`. A value import of an optional dep is a load-time crash ESM cannot catch — pinned by `tests/unit/core/parsing/optional-native-binding.test.ts`

## Phase 2 — a clean install
- Builds: 0027
- [x] `CXXFLAGS` is no longer a requirement, because the native build is no longer required — the section is now "Parsing fidelity: native vs fallback" with a per-platform toolchain table. It keeps the Node 23+ flag, and adds the trap it creates: an optional dependency that fails to compile is reported by npm as SKIPPED, not as an error, so a Node 23+ user lands silently on the fallback
- [x] README install section rewritten to `npm i -g conducks` plus `conducks doctor` to confirm the parse path. The MCP config block is now `"command": "conducks", "args": ["mcp"]` — no path to edit, one block for every client. From-source install and the path-based config moved into `<details>` for contributors
- [x] also removed a STALE README warning: it told the user `conducks setup` auto-registers a path that does not exist. `setup.ts:49` resolves the real CLI entry from its own install location and has done since that bug was fixed
- [x] `help.ts:109` now prints `https://github.com/Conducks/conducks#readme` — the tarball ships only `[build, config, LICENSE, README.md]`, so no repo-relative docs path can resolve for a global install
- [x] added `repository`, `homepage` and `bugs` to `package.json` — all three were absent, which would have published a package with no link back to the source
- [x] tarball verified: `npm pack --dry-run | grep -c docs/` = 0. Now 411 kB packed / 1.6 MB unpacked / 686 files (was 22.9 MB). Re-check before every release

## Phase 3 — release and update notice
- [x] update notice built: `src/lib/domain/federation/update-check.ts`, surfaced as check 7 of `conducks doctor`. It TELLS and never upgrades, and the upgrade command matches the install — `npm i -g conducks@latest` for a global install, `git pull && npm install && npm run build` for a linked checkout, decided by whether the module path sits under `node_modules/conducks/`
- [x] cached at `~/.conducks/update-check.json`, 24h TTL. Global, NOT the project vault: the installed version is the same whichever repo you run in, so a per-project cache would re-ask once per project. This is also the `~/.conducks/` home todo17#P2 wants for `projects.json`
- [x] the check is the FIRST and only outbound call in conducks, so it is deliberately weak: 2s timeout, no retry, every failure swallowed, `CONDUCKS_NO_UPDATE_CHECK=1` to disable. Covered by `tests/unit/domain/federation/update-check.test.ts` (9 cases, all off the cache — no test hits the network)
- [x] a 404 (no release published) is reported as its own state, not as a failed check. The repo has no releases today, so collapsing the two would have made `doctor` warn on every run until the first release
- [ ] SAID PUBLISHES, not the agent — deliberate, decided 2026-07-26. Claim the name with `npm publish --tag next`: it reserves `conducks` while leaving `npm i -g conducks` resolving to nothing. Everything it gates is green — tarball clean, `doctor` honest about the parse path, gates passing
- [ ] publish `latest`, then cut a matching GitHub release so the update notice has something to compare against — until a release exists `doctor` reports "no release published yet"
