# todo18 — loose ends: the decisions and the hygiene left behind

Status: todo
- Acceptance: no open question from ADR 0026 remains unanswered, the docs gate runs without being remembered, and one conducks skill loads once rather than twice

Small items that are each real and none of which belong to a bigger todo. Two are questions ADR 0026
deliberately left open; the rest is hygiene that only shows up when someone trips on it.

## Phase 1 — answer the two open dead-code questions
- Builds: 0026
- [ ] `src/lib/core/algorithms/clustering/daac.ts` (149 lines, `DAACClustering.cluster()` at :14) — research whether it should replace `detectCluster()`, called at `src/lib/domain/visual/mirror.engine.ts:124` and `:130`. DAAC combines graph relationships with directory proximity; `detectCluster` is directory-only. Then wire it, or delete it with the reason recorded
- [x] `parsing/language-plugin.ts` — RESOLVED, it stays. `docs/todos/todo09.md:110` records `isSupported (language-plugin.ts:51): DECISION = KEEP — language-plugin API contract`, and `isSupported` sits at exactly `src/lib/core/parsing/language-plugin.ts:51`; `src/types/language-plugin.ts` has no such method. The KEEP refers to the parsing file

## Phase 2 — make the gates run by themselves
- [ ] a pre-commit hook running `conducks docs-lint` (exits non-zero on violations, `src/interfaces/cli/commands/docs-lint.ts`). The watcher (`src/lib/domain/analysis/docs-watcher.ts`) reports but never fails, by design
- [ ] decide the skill scope: global only, or global plus a local pin. `~/.claude/skills` and `<repo>/.claude/skills` both hold all four, so each loads twice. `conducks setup --local` / `--global` selects; the scope logic is `sync()` in `src/lib/domain/federation/conducks-installer.ts`
- [ ] open `http://localhost:3333` (`conducks mirror`), click the document icon, and confirm the Docs panel renders. Only ever verified at the API (`/api/docs`, `src/interfaces/web/mirror-server.ts:97`) and served-asset level; the renderer is `loadDocs()` in `src/resources/mirror/ui.js`

## Phase 3 — clear the archived suite
- [ ] `tests/legacy/` holds 77 `.ts` files referencing deleted symbols. It is gitignored (`.gitignore:18`) and excluded from tsc and jest, so it is untracked dead weight that still reads as tests
- [ ] keep any case that still describes live behaviour by porting it into the real suite, then delete the folder
