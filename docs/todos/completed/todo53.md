# todo53 — finish walking the MCP surface, mode by mode
Status: done
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

- [x] `trace` — `reachability`, `path`, and the deprecated `execution` alias. `execution` and an unset
      mode are byte-for-byte identical to `reachability` (diffed over stdio JSON-RPC), so ADR 0066's
      alias has NOT diverged. Four defects found and fixed: an invented `::` id answered "0 steps"
      instead of refusing (shared with `impact`, `explain`, `context` — one `resolveSymbolId` now, in
      `shared/resolve-symbol.ts`, which verifies the node exists); `mode:"path"` with no `target` ran
      reachability under a request for a shortest path; `mode:"banana"` fell through to reachability;
      and a step that is a DANGLING EDGE TARGET (`graph.findnodesbyname` — 7 edges, 0 node rows)
      rendered as a symbol with its id echoed as its name. Pinned by
      `tests/unit/interfaces/tools/mcp-symbol-resolution.test.ts`.
- [x] `context` — `radius`, `max_tokens`, `include_atoms`. On VALID input all three are honest:
      `max_tokens: 300` returned 250 tokens with `truncated: true`, radius 1/2/5 gave 2/74/1903
      candidates, `include_atoms: true` moved 74 -> 95. The defects were all on out-of-contract input,
      and the schema's own bounds were never enforced at runtime: `radius: 0` reported an empty
      neighbourhood as clean, `radius: "two"` made `Math.min("two",10)` NaN and so removed the depth
      guard entirely (1923 nodes — the WIDEST walk, from a junk value), `max_tokens: "lots"` dropped
      the budget, and `include_atoms: "yes"` was read as false. Fixed with shared `numErr`/`boolErr`
      beside `enumErr`, and the bounds now live in one constant that both the inputSchema and the
      guard read. Pinned by `tests/unit/interfaces/tools/mcp-param-bounds.test.ts`.
- [x] `flows` — `min_members`, `limit`. `meta.truncated` was already honest on valid input, but the
      DENOMINATOR was not: `total` counted every flow in the graph (2,878) regardless of the filter, so
      `min_members: 10` reported 20 of 2,878 when the truthful reading is 20 of the 217 that matched.
      `matching` is now reported beside `total` and `shown`. Bounds again unenforced: `min_members:
      "two"` gave `shown: 0, truncated: false` (a clean nothing, since `length >= NaN` is false for
      every flow), `limit: "x"` gave an empty page, and `min_members: 0` / `limit: 9999` were silently
      clamped. All four now refuse via `numErr`. Pinned in `mcp-param-bounds.test.ts`.
- [x] `coverage` — a missing file and a malformed file were already honest (both refuse as
      COVERAGE_FAILED, with ENOENT and the JSON parse error respectively). A report matching NOTHING in
      the graph was not: it returned `{functions: [], summary: {total: 0, full: 0, dark: 0}}`, the same
      payload a perfectly covered codebase produces. `coverage` is now migrated to `Verdict` — the one
      ADR 0145 named and the first of its unmigrated list to be done — so it answers
      `status: nothing-to-check` with `why` naming the 927 graph functions that were offered to the
      report and matched none. `summary.considered` (graph functions checked) now sits beside `total`
      (the ones the report covered). `limit: "x"` also returned an empty page against 752 bound
      functions and now refuses. Pinned by `tests/unit/interfaces/tools/mcp-coverage-walk.test.ts`.
- [x] `docs` — `layer`, `recent`, `raw`, `scope`. `scope` was already honest (UNKNOWN_SCOPE, naming
      the available trees). The EMPTY case was not: a directory with no `docs/` returned
      `health.grammarViolations: 0` with empty lists — indistinguishable from a fully-closed tree —
      while BOTH CLI surfaces already answered it correctly ("nothing was linted, which is not the same
      as clean"). The denominator rule was hand-written in each CLI command and absent from the tool,
      so the tool had no way to be right; it is now `governedCount(board)` in the domain, called by all
      three (reached from the CLI via the registry, since `cli -> domain` is a forbidden static edge —
      the boundary test caught the first attempt). `health.grammar` now carries the Verdict:
      `nothing-to-check` on an empty tree, `clean` with `checked: 181` on this repo, which matches what
      `docs-lint` prints. Parameters: `layer:"banana"` returned `all` byte-for-byte, `raw:"yes"` turned
      the FULL board ON (the mirror of `context`'s `include_atoms:"yes"`, which turned one off), and
      `recent:"four"` / `recent:-5` silently substituted. All four refuse. Pinned by
      `tests/unit/interfaces/tools/mcp-docs-walk.test.ts`.
- [x] `diff` — it did NOT share the CLI's path; it held a private copy that had received none of the
      CLI's fixes. Measured on this repo, same moment, same graph: CLI "Analyzed 15 hunks. 7 symbols
      impacted", tool `{totalImpacted: 0}`. Three independent bugs, any one of which zeroes the answer:
      `git diff -U0` with no `HEAD` (staged changes invisible — ADR 0122 fixed this in the CLI only),
      no `git ls-files --others` (untracked invisible — the 2026-08-08 CLI fix, also missed), and a
      symbol matcher ending each symbol at `lineStart + (complexity || 1)`, reading a cyclomatic count
      as a line span. `mode:"historical"` was ADVERTISED in the schema and implemented nowhere — it
      fell through to the working-tree path, so it was byte-identical to `uncommitted`; the enum now
      names only what is implemented and pulse history stays a CLI command. Both surfaces now call
      `change-set.ts` through the registry and agree: 18 changed files, 8 symbols. `changedFiles` is
      reported as the denominator. Pinned by `tests/unit/domain/change-set.test.ts`.
- [x] `query` — `filter` mode was already honest (a missing filter, unknown field and unknown operator
      all refuse with INVALID_FILTER). Five defects elsewhere. The worst: `mode:"template"` discovery
      advertised 22 templates and `ALLOWED_TEMPLATES` was a hand-typed Set of 21, so `type_coupling`
      was listed WITH a description and then refused when called — and the refusal told the caller to
      consult the list that had just advertised it. The allowlist is now ASKED of the library
      (`listTemplates()`) instead of retyped. Also: `mode:"banana"` ran fuzzy silently; `limit:"x"`
      reached DuckDB and leaked `Could not convert string 'x' to INT64`; `limit:0` became 10; and
      fuzzy's `truncated` was HARD-CODED false, so a capped result set claimed to be whole — it now
      asks for limit+1 and measures. `PARAM_DEFAULTS` was missing `minImporters`, so `type_coupling`
      with no params crashed on `CAST('' AS INTEGER)`; added. Pinned by
      `tests/unit/interfaces/tools/mcp-query-walk.test.ts`.
- [x] `explain`, `impact` — `direction=downstream` works and differs from upstream (10 vs 6 on the
      probe symbol), `depth` 1..10 changes the answer, `impact`'s `meta.truncated` is MEASURED against
      the full affected set rather than asserted, and `explain` returns its full risk breakdown. Two
      defects: `direction:"sideways"` was accepted, ran DOWNSTREAM (the domain treats anything that is
      not "upstream" as downstream) and echoed `"direction": "sideways"` back in the payload as though
      it were a real direction — a junk value reported as fact, not merely tolerated; and `depth` 0, 99
      and "deep" all silently became the default. Both refuse now. Pinned in
      `mcp-symbol-resolution.test.ts`.

## Phase 2 — the shapes worth checking everywhere

- [x] Every enum parameter, given a junk value. Nine enums exist across the surface, read out of the
      REAL schemas rather than grepped: impact.direction, trace.mode, diff.mode, query.mode,
      query.filter.conditions[].operator, status.mode, audit.mode, prune.type, docs.layer. All nine
      now refuse junk; the last gap was `conducks_status`, where `mode:"JUNK"` returned the HEALTH
      payload byte for byte — on the tool whose own history already includes `manifest` silently
      returning health's payload (todo28#P1). Every VALID value of all nine was also driven and
      answers correctly (`status --mode pulse` correctly requires its `file` param).
- [x] Every tool, on an EMPTY vault (analyzed, then `conducks clean`, so the vault exists with 0
      nodes). Eight of twelve were already honest — `status` said `"status": "empty"`, `docs` said
      `nothing-to-check`, and the four symbol tools refused with SYMBOL_NOT_FOUND. Four were not:
      `audit` answered `{success: true, violations: [], totalViolations: 0}` — an architecture pass
      over nothing — `prune` answered "no dead code" for a repo with no code, and `query` and `flows`
      returned empty lists that read as misses. All four now answer `nothing-to-check`. The guard reads
      the VAULT, not the in-memory graph: a first version used `status()` and reported "no symbols" for
      a filter query against this repo's own 6,144-node vault, because filter/template modes
      deliberately never load the graph. The existing suite caught it and a live probe confirmed it.
- [x] Every tool that truncates, for whether `meta.truncated` is honest. All 17 `truncated:` sites
      classified as MEASURED or LITERAL. Eleven were measured and correct. Six literals: four are true
      by construction and now say so in a comment (`trace` path mode — `findPath` caps nothing;
      `status` modes — no list; `audit` — returns every violation; `graph_query` — the caller's own SQL
      LIMIT). Two were lies, both in `query`: fuzzy (fixed in P1) and TEMPLATE mode, which was worse —
      `limit` was never forwarded to `execute()`, so every template answer was capped at the service
      default of 10 no matter what the caller asked (`limit: 50` and `params: {limit: 50}` both
      returned 10) while `truncated: false` called those ten the whole answer. Both now ask for cap+1
      and measure. Pinned in `mcp-query-walk.test.ts`.

## Found here, fixed elsewhere

Two defects were measured and reproduced during this walk and deliberately left standing, because
each needed a decision rather than a patch. They are tracked in **todo54**, not here: an unchecked
line in a closed todo is invisible to `docs-status`, which counts phases.

- A template identifier param with no value becomes `''` and the query answers zero rows —
  `blast_radius` with no `symbolId` says "nothing breaks". todo54#P1.
- `conducks_docs raw:true` returns 279,483 bytes with no cap. todo54#P2.

## Not in scope

- Re-testing what is already pinned. `status`, `graph_query`, `rename` and the concurrency behaviour
  have regression tests; this task is what remains.
