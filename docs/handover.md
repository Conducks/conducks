# Handover — 2026-08-07
Status: current

## Where it stands
Gates fully green: **1,598 tests / 199 suites**, typecheck 0, `guard` clean, `docs-lint` 182,
`visuals-lint` clean (59 anchors, 22 pages, 58 review stamps), `audit` green. Vault on its own
source: 6,144 nodes, 22,469 edges. One branch, `main`, local == origin — the 16-branch backlog was
merged and deleted, remote included.

## The board is NOT empty — and that is the point
todo48#P4 (layer-write activation), todo49 (a repository's first analyze builds a thinner graph than
its second) and todo50 (the CLI verification walk) are open. The board WAS empty on 2026-08-06; a day
of running the commands rather than reading them refilled it, which is the honest signal.
Every todo through 47 is closed and in `completed/`. todo09's "blocked: offline" header was STALE —
the vuln-surface task was built 2026-08-01 and the blocker found false the same day, but only the
task line was updated and the header sat wrong for five days. Re-proven live and closed. todo31
stays deliberately parked: three reopen-triggers as deferred-with-condition.

## 2026-08-07 — the CLI walk, and what it says about "done"
Three commands were verified against a truth (`status`, `list`/`query`, `analyze`) and produced
THIRTEEN defects, every one of which ran without crashing beforehand. 36 of 39 invocations still run
clean, and that bar is now known to prove almost nothing. State verified/unverified counts together;
"the CLI works" is not yet a claim anyone can make (todo50).

The defects worth carrying forward, all now in `memory.md` or a module note: a parse-time `isTest`
flag that does not survive the vault (so a filter written against it is a no-op — five copies of that
predicate existed), git quoting non-ASCII paths out of the graph entirely, a scoped pulse advancing
the global freshness clock and consuming every out-of-scope change, and a first-ever analyze writing
6 of 63 handover edges.

Two of the checks written for those fixes were VACUOUS when mutated (CONDUCKS-41). The mutation
runner is `npm run cli:mutate` and should be run against any new check.

## What the earlier stretch built (read the ADRs, they carry the reasoning)
- **The visuals pipeline** (ADR 0138–0142): anchors checked against the working tree; drift proven
  by re-running the repo's DECLARED generator (`conducks.json` → `visuals.generate`) with a restore
  contract; module notes moved INTO the pipeline (`docs/visuals/modules/<path>.md` is SOURCE,
  `docs/modules/` is gone from the standard); review stamps hash the exact cited span so "the code
  under this claim changed" flags a short precise re-read list; the stamp's meaning is protected
  (per-page `--stamp <page>`, committed store, resolved-span keys, structured `Provenance:` marker).
- **conducks arch** finished ADR 0134's program: doors, composition root, layer direction,
  per-service monorepo verdicts, and cluster SHAPE (fan-in/out, hub share, density).
- **Adoption is one command**: `conducks setup` installs skills, MCP, registry, ignore file AND the
  pre-commit gates (`install-hooks`, todo46); skills re-sync on every build (postbuild), so the
  installed copy can never lag the source.
- **trace/context tell dependency from co-location** (todo38): a step ENTERED by MEMBER_OF is never
  reported, but the walk still crosses containers so unit-scoped imports keep working; `context`
  now opens with the symbol's callers and their call-site lines.
- **The id re-case was decided AGAINST by measurement** (todo32): 38% of ids would change to fix 2
  live collisions whose damage was already fixed by value-wins. Recorded in the closed todo.

## Traps for the next session
- Frozen benchmark subjects (`test-projects/{scraper,orchestrator,sofie}`) take NO commits, ever.
  `tools/benchmark/health.mjs --compare` is the drift gate; analyze always `--force`.
- The stamp gate WILL flag your edits: touching a file cited by a module note prints a re-read flag.
  That is it working — re-read the claim, then `visuals-lint --stamp <page>`. Do not bulk-stamp.
- sofie (the live repo, `assistant/sofie`) migrated to the visuals-module pipeline and its `claude`
  branch sits ~94 commits ahead of origin, unpushed by decision — Said's call, not an oversight.
- `.conducks/note-reviews.json` is COMMITTED (the one carve-out from the ignored vault dir). Treat
  a PR that re-stamps many claims as an assertion someone actually re-read them.

## If you pick something up
The natural next pieces of work, none urgent: the deferred canvas→note link map in sofie (a curated
mapping of 25 blocks to the notes they cover), raising the DERIVED-header warn to an error once every
adopter's templates carry it, and the sofie branch push whenever Said wants it.
