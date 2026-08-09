# todo53 — finish walking the MCP surface, mode by mode
Status: todo
- Acceptance: every registered tool and every value of every enum parameter has been driven over real stdio JSON-RPC and its answer compared against the CLI or a hand-derived truth — with each defect either fixed and pinned, or recorded. "It returned a payload" is not the bar.
- Builds: 0146, 0145, 0124

## Context

The board read "Nothing open. Every phase is finished." while this was outstanding, which is exactly
the state the board exists to prevent.

The MCP surface has produced a defect on EVERY occasion it has been driven adversarially — eight so
far, against tools that all "worked" in the sense of returning a payload:

| found | tool |
|---|---|
| refused any class with methods (containment counted as a reference) | `rename` |
| `SELECT 1; DROP TABLE nodes;` reached the database | `graph_query` |
| density disagreed with the CLI by 5,000× under the same field name | `status` |
| the verdict was dropped from the payload entirely | `status` |
| pipelined calls answered `SYMBOL_NOT_FOUND` for symbols that exist | `impact` |
| an unknown mode silently ran `scan` | `audit` |
| an unknown type returned "0 dead code" for the whole codebase | `prune` |
| the description told the agent to call a tool that does not exist | `rename` |

The CLI had months of adversarial testing; this surface had almost none, and the hit rate reflects it.

## Phase 1 — the unwalked tools and modes

Each one driven over real JSON-RPC, answer compared to the CLI or a hand-derived truth, not merely
inspected for shape.

- [ ] `trace` — `reachability`, `path`, and the deprecated `execution` alias. Confirm `execution` still
      behaves identically to `reachability` rather than having quietly diverged, since ADR 0066 keeps it
      only for old callers.
- [ ] `context` — `radius`, `max_tokens`, `include_atoms`. `max_tokens` is the one to distrust: check
      that the returned payload actually respects it and that truncation is REPORTED, since a silently
      truncated context reads as a complete one.
- [ ] `flows` — `min_members`, `limit`. Check `limit` truncation sets `meta.truncated`, the defect
      already found once in `coverage` (todo28#P2).
- [ ] `coverage` — beyond the limit case already pinned: a missing file, a malformed file, and a file
      describing symbols the graph does not hold.
- [ ] `docs` — `layer=all|board`, `recent`, `raw`, `scope`. Include the empty case: a project with no
      `docs/` must not report clean (ADR 0124).
- [ ] `diff` — `uncommitted`, `historical`, `drift`. The CLI half of `diff` was found blind to
      untracked files on 2026-08-08; check whether the tool shares that path.
- [ ] `query` — `filter` mode, and `template` with a bad template name, which is the same
      unvalidated-enum shape found in `audit` and `prune`.
- [ ] `explain`, `impact` — remaining parameter combinations, including `direction=downstream`.

## Phase 2 — the shapes worth checking everywhere

- [ ] Every enum parameter, given a junk value. `enumErr` now exists but is wired into `audit` and
      `prune` only; the others were never checked.
- [ ] Every tool, on an EMPTY vault. The CLI boundary now answers this properly; the tool surface
      returns its own payloads and was not checked.
- [ ] Every tool that truncates, for whether `meta.truncated` is honest.

## Not in scope

- Re-testing what is already pinned. `status`, `graph_query`, `rename` and the concurrency behaviour
  have regression tests; this task is what remains.
