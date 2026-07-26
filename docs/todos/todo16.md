# todo16 — make conducks installable: one command, no build chain

Status: todo
- Acceptance: `npm i -g conducks` succeeds on a clean machine with no compiler flags and no build tools, and `conducks analyze .` works immediately afterwards

Conducks is meant to be a platform every project uses, but installing it means cloning the repo and
hand-editing an absolute path into an MCP config. The npm name `conducks` is FREE and NOT yet claimed
(checked 2026-07-26: registry returns 404); what stands between it and a real release is the
dependency chain, not the registry.

## Phase 1 — settle the grammar path
- [ ] measure whether a pulse works with the native `tree-sitter-*` packages absent. Native is imported at `src/lib/core/parsing/prism-core.ts:1`, `grammar-registry.ts:1` and every `languages/*/extractor.ts:1`; WASM is loaded from `src/resources/grammars/` at `src/registry/index.ts:52`, `lib/core/registry-bootstrapper.ts:14`, `lib/core/graph/graph-engine.ts:46`, `lib/domain/analysis/orchestrator.ts:50` and `conducks-core.ts:92`. Both paths exist; one is redundant
- [ ] if WASM is the runtime path, move the 13 `tree-sitter-*` entries in `package.json` `dependencies` to `devDependencies`, and record in `docs/memory.md` which path is authoritative
- [ ] decide whether `src/resources/grammars/` (20 MB, 14 `.wasm` files) ships in the tarball or downloads on first use — it is the bulk of the 22.9 MB unpacked size reported by `npm pack --dry-run`

## Phase 2 — a clean install
- [ ] remove the `CXXFLAGS="-std=c++20"` requirement documented at `README.md:273-279` (Node 23+ V8 headers need C++20; tree-sitter's `binding.gyp` defaults to C++17), or state plainly which platforms need it. `npm run bootstrap` (`README.md:51`) exists only to work around this
- [ ] rewrite `README.md:45-88`: it tells the user to `git clone` and hand-edit an absolute path into their MCP config. Replace with `npm i -g conducks` and a config needing no path
- [ ] `src/interfaces/cli/commands/help.ts:109` prints `Detailed Documentation: ./docs/mechanics.md` — that file does not exist, and `docs/` left the tarball when `package.json` `files` was trimmed. Point it somewhere real
- [ ] verify the tarball carries no project docs — `package.json` `files` is now `[build, config, LICENSE, README.md]`; re-check with `npm pack --dry-run | grep docs/` before every release (it shipped 76 doc files including `handover.md` and every todo until 2026-07-26)

## Phase 3 — release and update notice
- [ ] claim the name early with `npm publish --tag next` — that reserves it while leaving `npm i -g conducks` resolving to nothing, so nobody installs the build-chain gamble
- [ ] publish `latest` once Phase 2 is green
- [ ] check `https://api.github.com/repos/Conducks/conducks/releases/latest` against `package.json` `version` and TELL the user, with the upgrade command matching how they installed — never self-upgrade. Surface it where `doctor` already reports environment facts (`src/interfaces/cli/commands/doctor.ts`)
- [ ] cache the result in `.conducks/` so a version lookup does not run on every command
