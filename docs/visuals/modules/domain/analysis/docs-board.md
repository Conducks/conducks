# domain/analysis/docs-board — the links between docs

**Part of:** [domain/analysis](../analysis.md). Sits on top of
[docs-grammar](docs-grammar.md); backs `conducks docs-status`, `conducks_docs` and the
mirror's /api/docs. `analysis/docs-board.ts` and `analysis/docs-watcher.ts` are documented here together — the watcher is a thin trigger on this
module, not a subsystem of its own.

**Responsibility:** the cross-file half of the docs standard. `docs-grammar` parses ONE file and has
no idea the others exist; this walks the tree and resolves what only the set can answer — which
decision a phase builds, which phase another waits on, what an accepted record left unbuilt, and
whether a supersede dropped a remainder. It also owns the agent projection.

**Boundaries:** derivation and linkage only. It never parses markdown (that is `docs-grammar`) and
never touches the code graph — no call, import or coverage fact enters this module. It reads the
docs tree from disk and returns a plain object; nothing is written back, ever.

**Deferred / not built:** `- Builds:` / `- Depends:` are hand-written, so an unlinked ADR is
reported rather than detected. Proving a decision is implemented from the code itself (walk
`- Enforced by:` into the graph and check the symbol exists and its test passes) is the obvious next
step and is deliberately not built — it needs the graph, which would put a code-layer dependency
into a module that is currently docs-only.

## Why the projection exists, and why it is not just a smaller board

`buildBoard` returns everything: 17.9k tokens on conducks itself. `agentView` returns 3.7k at
session start and 1.4k after. The saving is not compression — it is a different question being
answered. The board answers *how is the project doing* (percentages, counts, history); an agent
needs *what may I do next, and what must I not break*. Percentages are unactionable; the next
unchecked task and the rule you would violate are not.

Two axes decide what is in the payload:

- **Open vs closed.** Finished phases and done todos are absent. An agent needs the table, not the
  history — and history is what `--all` and `--raw` are for.
- **Read-once vs read-often.** Conventions and memory are loaded at session start and kept, so
  shipping them on every call was 10.7k of the original 14.7k. `layer: "board"` drops them.

`features.md` is never in the payload at all. It is write-mostly: updated once an ADR and its todos
are finished.

## Everything here is derived, and that is the point

A phase's state is its checkboxes. Blocked is an unmet `- Depends:`. An ADR's build state is the
phases that claim it. None of it is authored anywhere, so none of it can drift (ADR 0019, 0020, and
CONDUCKS-19/20). The one authored claim that survives — a todo's `Status:` — is deliberately NOT
trusted: `hygiene()` compares it against the checkboxes and reports the gap.

`unlinked` is a distinct build state, and the distinction is load-bearing. An ADR that nobody
linked has no evidence either way; collapsing it into a success state would make silence read as
success, which is the failure the whole link graph exists to prevent. But a PHASE LINK is not the
only evidence: `completed/` is never walked, so promoting a todo removes the phases that linked its
ADRs — 141 of 142 fell to `unlinked` the day this repo's board was finally clean. So `proven` (a
`- Enforced by:` test) and `resolved` (a `- Resolved by:` successor) hold whether or not a phase
still links, and `board.unlinked` is DERIVED from the field rather than re-deciding the question —
computed separately, the two drifted apart and disagreed about the same ADRs.

## Two severities, because a gate that cries wolf gets turned off

`lint` is broken grammar — a dangling `- Builds:`, a supersede that abandons unbuilt work, a
duplicate phase number. It fails `docs-lint` and therefore CI. `warns` is hygiene — a `done` todo
still sitting in `todos/`, a `Status:` the checkboxes contradict. Both are true findings; only the
first means the board is reading a file wrong. Mixing them would have failed this repo's CI on five
unpromoted todos, and the fix for that is a filing cabinet, not a build.

The unlinked-ADR finding is aggregated into a single `board.unlinked` list rather than one warning
per file, because on a repo that predates the link fields it is every ADR at once, and a wall of
identical lines trains the reader to ignore the channel.

## The watcher exists because a gate nobody runs is not a gate

`docs-watcher.ts` re-lints on write and reports; it never throws and never exits non-zero. A watcher
that fails hard turns an editor save into a broken loop, and a developer who cannot save turns the
watcher off — so the strict surface stays on `conducks docs-lint`, where CI and pre-commit want it.

It re-reads the whole tree per event rather than the one changed file, because the findings that
matter are relative to the other files: a `- Builds:` is only dangling with respect to the ADR set. A
docs tree is tens of small markdown files.

Two things the tests forced, both real:
- **`ready` gating.** Chokidar's `ignoreInitial` races its own scan — on macOS a file written moments
  before `start()` can arrive as an `add` after `ready` fires. Events before `ready` are dropped; a
  late straggler still costs only one extra re-lint, which is log-only anyway.
- **`files[]`, not `filePath`.** The pulse originally reported the last event in the debounce window
  as "the file you edited". It is not — it is whatever landed last. The pulse now carries every file
  in the window, and `filePath` is explicitly just the newest of them, for display.

## The module hash lives in one file, and that is the whole point

A reviewed module note is compared against `moduleHashOf` (`analysis/module-hash.ts`). That function
used to exist TWICE — here and in `ProjectMonitor` — coupled only by a "must match" comment. Two
copies of a hash is a drift waiting for its moment: the two disagreeing marks every reviewed note
drifted, or none, and either way silently. Both callers import the one function now and the equality
is pinned by a test rather than by a comment. Non-recursive on purpose: a note covers its own
directory, so hashing subtrees would fire a flag for a change in a submodule that has its own note.
