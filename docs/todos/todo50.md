# todo50 — every CLI command verified against a truth, not against "it ran"
Status: doing
- Acceptance: each command family below has been checked against a source of truth outside the graph, with the defects found either fixed or filed — and the count of VERIFIED commands is stated wherever the walk is reported, so partial coverage can never read as complete.

## Context

36 of 39 CLI invocations run without crashing (`tools/benchmark/cli-smoke.mjs`, measured
2026-08-07; the other three start servers). That bar proves almost nothing: **every defect found in
this walk so far passed it** — a test-file ranked as the top hotspot, a documented `--mode` nothing
implemented, an inventory with its own ordering, non-ASCII paths dropped from the graph, a scoped
pulse consuming out-of-scope changes.

Three commands have been checked at the level that matters (does the ANSWER match reality) and they
produced thirteen defects. Reporting each as "done" made 3-of-39 read as finished, which is why
every subsequent test looked like a new regression rather than the first look at untested surface.

**How to report this:** state verified and unverified counts together. "status verified" is true;
"the CLI works" is not, and will not be until this todo closes.

## Phase 1 — symbol answers, against the language's own parser
- [x] `query`, `list`, and the `*` inventory — witness built (`ast` for Python, TS compiler for
      TypeScript) and matched name-for-name: 145 classes and 1,028 functions, 100.00% both
      directions, zero missing and zero invented on the frozen Python subject
- [ ] `explain` and `entry` against the same witness: `explain` must return the author's own text for
      a symbol the witness says is documented, and `entry` must not name a symbol nothing calls
      unless it is genuinely an entry point

## Phase 2 — graph traversal, against a hand-derived fixture
- [x] `impact`, `trace`, `context`, `flows`, `cohesion`, `entropy` on a fixture whose every edge is
      written by hand, so each answer has a known-correct expectation rather than a plausible one
      → `tests/integration/features/traversal-truth.test.ts`. The fixture is built so each command
      has one right answer and several tempting wrong ones: two orphans that SHARE A FILE with the
      real chain, which is the only way co-location can masquerade as dependency. ALL FOUR PASS —
      `impact format` reaches fetchUser and run and neither orphan, `trace run` reports no container
      as a step, `context` names its callers, and an uncalled symbol's zero states its basis. This
      family is CORRECT; the one failure was my assertion, not the code (see below)
- [x] The property to check per command is DIRECTION and DEPTH, since both are invisible in a
      plausible-looking answer: `impact` upstream must not report a sibling reached through a shared
      container (ADR 0129), `trace` must not report the containment ladder as a dependency (todo38)
      → both hold on the fixture. Worth recording: the single failing case was a regex I GUESSED
      rather than read — `impact` says "0 Symbols affected" and had printed its full basis line all
      along. That is the fourth time in this walk the check was wrong rather than the code, which is
      now the more common failure mode and the reason CONDUCKS-41 exists.

## Phase 3 — judgments, scored against a repo whose real state is known
- [ ] `audit`, `arch`, `guard`, `advise`, `drift`, `fallback`, `ledger` — each returns a VERDICT, so
      the check is whether the verdict is right, not whether it printed. Score on a subject whose
      architecture was read by hand (openship was scored this way for `arch`; the same method applies)
- [ ] Every verdict that fires must be traceable to the measurement that produced it, and a verdict
      that cannot be must be reported as LOW confidence or not at all (ADR 0134)

## Phase 4 — lifecycle and docs surfaces
- [ ] `docs-status`, `docs-lint`, `visuals-lint`, `supply-chain`, `doctor`, `monitor`, `diff`,
      `record`, `coverage`, `coverage-view`, `prune`, `rename`, `link`, `install-hooks`
- [ ] The three excluded from the sweep because they block — `mirror`, `watch`, `mcp` — need a
      harness that starts them, asserts one request or event, and stops them. Excluded is not tested

## Phase 5 — the harness keeps what the walk learns
- [x] `cli-smoke.mjs`: every fix becomes a check, subjects DISCOVERED not listed, an empty output can
      no longer read as a clean absence
- [x] `mutate-cli-smoke.mjs` (CONDUCKS-41): every check proven able to fail. Two were vacuous when
      first written
- [ ] A check per command family added as each phase closes, so "test everything again" stays one
      command
