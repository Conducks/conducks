# Handover — 2026-07-26
Status: current

## Where it stands
- **The docs are a link graph now** (ADR 0019, 0020). Line-atomic grammar: a value is the whole line
  and never wraps. A record carries its own state — `Status:` is life-state only, relations are
  both-ends fields, and `decisions/README.md` holds no index. The phase is the unit of linkage:
  `- Builds: NNNN` up to a decision, `- Depends: todoNN#PN` sideways. Phase state, blocked, and an
  ADR's build state are all derived; a todo's `Status:` is a claim lint checks against the checkboxes.
- **The board returns open threads only**, rooted at the ADRs that own them — ~3.7k tokens at session
  start, ~1.4k after (`layer: "board"`), against 18k raw. `conducks_docs` is the docs LAYER: markdown
  only, no graph, no database, works on a project that was never analyzed (ADR 0023).
- **`progress.md` is retired** (ADR 0024) — recent activity is derived from ADR dates
  (`recent: <n>`). The old file is archived in `docs/legacy/`.
- **Skills: 8 → 4** (ADR 0025) — `conducks-guide`, `conducks-workflows` (explore·debug·impact·
  refactor·audit), `conducks-docs`, `conducks-cli`. Written for someone else's project: no internal
  record numbers, no paths from this repo presented as universal, instructions rather than
  prohibitions. Installed GLOBALLY by default now (ADR 0022): `~/.claude/skills`, `--local` pins a
  repo copy, retired names are deleted from every scope on sync.
- **`analyze` guards its root** (ADR 0021): `ask` for a root with no project marker or over 25k
  files, `ask-twice` (type the folder name) for OS trees, home, cloud-sync folders, dependency dirs,
  and any folder whose subfolders are themselves projects. Nothing is forbidden; no TTY means no.
- **Dead code**: `dynamic-loader.ts` and `config-detector.ts` removed with their resource;
  `daac.ts` and `parsing/language-plugin.ts` deliberately left pending a decision (ADR 0026).
- **Docs are watched** — `conducks watch` and `conducks mirror` re-lint on save and pulse the result
  to the mirror's Docs panel. Log-only; `docs-lint` remains the exit-code gate.
- Gates: **186 tests** · typecheck 0 · `audit` clean · `docs-lint` clean (40 governed docs) · board
  reports 0 hygiene warnings.

## Next, in order
1. **Merge or keep the branch.** This work is committed as `25a5ef5` on
   `docs/link-graph-and-platform-prep`, not on `main` — 78 files, 3054 insertions. `main` is one
   fast-forward behind (`git checkout main && git merge --ff-only docs/link-graph-and-platform-prep`).
2. **todo16** — make `npm i -g conducks` work: settle native-vs-WASM grammars, trim the dependency
   chain, fix the README install section, then claim the npm name (`conducks` is still free).
3. **todo17** — always-on monitoring: hash-gated incremental parsing, then a cross-project monitor,
   then code-change-implies-doc-check. Only the docs watcher exists today.
4. **todo18** — the two open dead-code questions (ADR 0026), a pre-commit hook for `docs-lint`, the
   global-vs-local skill scope call, and clearing `tests/legacy/`.
5. **todo10#P2 / todo10#P4** are the only other decision-linked work open.
