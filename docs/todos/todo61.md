# todo61 — every MCP capability must exist on the CLI, and answer the same
Status: todo
- Acceptance: for all 12 paired capabilities, every MCP parameter has a CLI equivalent, the enum vocabularies match, and driving both on the same input yields the same ANSWER SET — differing only in rendering. Proven by an equivalence test, not by inspection.
- Builds: 0148, 0005

## Context

The rule, stated 2026-08-10: **not every CLI command is an MCP tool, but every MCP tool IS a CLI
command, and where both exist they mirror** — same input, same answer, differing only in how it is
rendered.

`tests/architecture/paired-surfaces.test.ts` currently enforces something much weaker: that both
surfaces reach at least one shared `registry.*` accessor. That would pass two implementations sharing
one helper and diverging everywhere after, which is close to what `context` actually is.

Audited all 12 pairs on 2026-08-10 by reading each MCP `inputSchema` against each CLI's declared
`usage`. The gaps are not incidental:

| pair | MCP has, CLI lacks | note |
|---|---|---|
| `trace` | `target`, `mode` | the whole `path` mode is unreachable from the CLI |
| `prune` | `type`, `limit` | CLI cannot filter to a finding type at all |
| `context` | `radius`, `max_tokens`, `include_atoms` | CLI takes only a symbol |
| `flows` | `min_members`, `limit` | CLI takes neither |
| ~~`audit`~~ | **NOT A GAP — this row was wrong** | see below |
| `coverage` | `limit` | |
| `status` | vocabularies DIFFER | MCP `health\|map\|manifest\|pulse`; CLI `pulse\|blueprint` |
| `rename` | safety INVERTED | MCP `dryRun` opt-in; CLI `--confirm` opt-out |
| `diff` | NOT a gap — see Phase 1 | CLI has `--base/--head` pulse compare AND `conducks drift`; the tool's `drift` mode maps to the latter. Both askable from both surfaces |

`explain`, `impact` and `query` are close to aligned already.

**A live defect found by the audit**: `impact`'s CLI reads
`const direction = (args[1] === "downstream" ? "downstream" : "upstream")`, so any unknown value —
`sideways`, a typo, a stray flag — silently answers upstream. That is the exact silent-substitution
shape fixed on the MCP side in todo53, still live on the CLI.

## Phase 1 — close the capability gaps

- [x] `impact`'s CLI direction refuses an unknown value and names it. A flag is still not treated as a
      direction, and an omitted direction still defaults to upstream.
- [x] `trace` takes `--mode reachability|execution|path` and `--target <symbol>`, with the tool's
      refusals: an unknown mode is an error, and `path` without a target is refused rather than answered
      with reachability. `execution` stays accepted as ADR 0066's deprecated alias. The symbol picker
      now skips EVERY flag's value, not just `--limit`'s, or `trace alpha --target beta` would have read
      `beta` as the symbol.
      VERIFIED AS A MIRROR on sofie: `watchKernelPrompt -> loadKernelPrompt` returns the same two steps
      from both surfaces. `--flow` stays CLI-only, which the rule permits.
- [x] `prune` takes `--type <TYPE>` and `--limit <n>`. The type list is read from
      `contracts/dead-code-types.ts` — the same constant the tool's enum spreads — so a sixth type
      reaches both surfaces at once rather than being remembered into one. `all` means no filter, as on
      the tool, and a limit that does not parse is refused rather than defaulted.
      VERIFIED AS A MIRROR on sofie: ORPHAN 17/17, STALE_IMPORT 20/20, UNIMPORTED_MODULE 35/35, and
      both surfaces refuse `BOGUS` with the same vocabulary.
- [x] DONE by todo57, WITH ONE DEVIATION FROM WHAT THIS TASK PRESCRIBED, recorded because it is a real choice and not an oversight. The extraction happened as described — the BFS is `registry.kinetic.context` and both surfaces reach it. But the CLI did NOT gain `--mode flow|neighbourhood`: the flow trace was REPLACED rather than kept beside the neighbourhood. Keeping it would have preserved the thing this todo exists to remove — one name answering two questions — and the measurement said it was not worth preserving: 2,407 entries of which 247 were unresolved `node` placeholders and 196 whole files. What survived from it is the `Called by:` section and the source lines, as rendering. Original reasoning below, still accurate about the problem:
- [x] `context` is NOT a flag gap, and adding those flags would make it worse. The two surfaces answer
      different questions: the CLI gives a directional flow trace (callers at depth 1 filtered to CALLS,
      the downstream chain, and SOURCE LINES via `source.lineReader`), while the tool runs a scored BFS
      over a radius with a token budget, excluding ATOMs and containers (ADR 0103). `--radius` has no
      meaning in the CLI's algorithm, so the flag would read as obeyed and do nothing — the exact shape
      this whole todo exists to remove.
      THE FIX IS AN EXTRACTION: the tool's ~130-line BFS and scoring must move into the domain, reached
      through the registry by both surfaces, and the CLI gains `--mode flow|neighbourhood` — keeping its
      own flow trace, which the one-directional rule permits, while making the tool's capability
      reachable. That is a three-layer change and is deliberately not bundled with the flag additions.
- [x] `flows` takes `--min-members <n>` and `--limit <n>`; the floor was hard-coded at 2 with no cap.
      VERIFIED AS A MIRROR on sofie at three thresholds — min-members 2/5/10 gives 1126/635/376 from
      both surfaces.
- [x] `audit` needed NOTHING. The first audit compared PARAMETER LISTS and concluded the CLI was
      missing four modes; comparing CAPABILITIES shows every one already has a CLI home, just under
      different command names:

      | MCP mode | CLI |
      |---|---|
      | `scan` | `conducks audit` |
      | `advice` | `conducks advise` |
      | `guard` | `conducks guard` |
      | `archeology` | `conducks audit --history=<n>` |
      | `fallback` | `conducks audit --fallback` |

      `threshold` exists too — `conducks guard --threshold=N`, calling the same `registry.audit.guard`
      with the same 0.1 default. Verified live: at 0.1 both report risk 0.0804 and pass; at 0.001 both
      report the same risk and flag the breach.

      The mirror rule is about CAPABILITY, not command shape. Adding `--mode` to `conducks audit` as an
      alias for three commands that already exist would be surface for its own sake, so it is
      deliberately not done. The lesson is in the method: compare what a user can ASK, not what the
      argument parsers look like.
- [x] `coverage` takes `--limit <n>`, capping only the LIST — the summary counts still describe the
      full bound set (750 functions), the same split the tool makes between `functions` and `summary`,
      and the CLI says how many it held back.
- [ ] `status`: RECONCILE the vocabularies rather than adding to either — decide one set of mode names
      and make both surfaces speak it. This is the only gap that is a naming decision rather than a
      missing flag.
- [x] `rename` — and this was worse than a mismatched default. The tool's inputSchema declares
      `dryRun: { default: true }`, but a JSON Schema default is DOCUMENTATION: the MCP server does not
      inject it, so an omitted `dryRun` arrived as `undefined`, and the domain signature is
      `rename(symbolId, newName, dryRun: boolean = false)`. Undefined became FALSE. **The only
      destructive tool on the surface mutated source files by default while advertising that it would
      not**, and the CLI had always been safe — so the two surfaces held OPPOSITE defaults for a
      destructive operation.
      Fixed: anything other than an explicit `dryRun: false` is a dry run, and a non-boolean is refused
      rather than guessed at. Verified on a real file — called without `dryRun`, the file's hash is
      unchanged and the original name is still present; called with `dryRun: false` it writes; the CLI
      still requires `--confirm`.
- [x] `diff`: HALF of this is already decided by ADR 0148 and does not need a call. The rule is one-directional — "an agent must never be able to ask something a person cannot" — so MCP's `drift` MUST gain a CLI home. The converse does not follow: the CLI's `--base/--head` pulse compare may stay CLI-only, exactly as `mirror` and `setup` do, and needs no tool
- [x] THE GAP WAS NOT A GAP, and this todo's own line ("CLI has pulse-compare, MCP has drift. Neither has the other") was wrong. **`conducks drift` already existed**, on the same `registry.evolution.compare(prevPulseId)` the tool calls. It was missed because the comparison was `diff`'s flags against `conducks_diff`'s parameters — the capability lives under a different COMMAND NAME. That is precisely the mistake ADR 0148 records for `audit` ("`advice` is `conducks advise`"), repeated here
- [x] I built `conducks diff --mode drift` before checking, and REVERTED it. A second door onto a capability that already has one is worse than the gap it was meant to close
- [x] What was actually missing is the MACHINE SURFACE: `conducks drift` had no `--json`, so the two answers could only be compared by reading rendered text. ADR 0148 names `--json` as the honest comparison point, so `drift` now has it — the same fields the tool returns, including the truncation the tool reports in its `meta`, and the verdict's exit code preserved (ADR 0127)

## Phase 2 — enforce it, since inspection rots

- [-] Strengthen `paired-surfaces.test.ts` to "reaches the same domain function" — DROPPED, and ADR 0148 already argued against it in writing: "A call-graph version would be stronger and would fail on legitimate presentation differences, so it would be argued with and then switched off." Two measurements this session say the same thing. `query` legitimately returns direct matches PLUS echoes where the tool returns direct only, and `drift` legitimately renders as text where the tool returns JSON — a call-graph gate would flag both and be wrong twice on its first run
- [x] The STRONG check is the equivalence test instead, and it cannot false-fail on presentation because it compares ANSWERS on real data rather than call graphs. Five pairs covered, each mutation-verified. That is the strengthening this phase wanted; the static gate stays weak and enforced, which is the trade ADR 0148 made deliberately
- [x] NOTED, not fixed: the static gate pairs a tool with a CLI file of the SAME NAME (`conducks_diff` -> `diff.ts`), so a capability living under a different command name is invisible to it — which is exactly how `conducks drift` was missed. The equivalence test does not share that blind spot, since it drives capabilities rather than files
- [x] DONE — `tests/integration/features/surface-equivalence.test.ts`, driving the MCP side over real stdio JSON-RPC (the path an agent takes) rather than a mocked handler. Three cases: `prune`'s finding set, `diff --mode drift`'s status/summary/deltas/truncation, and an unknown mode being refused by BOTH with the SAME vocabulary
- [x] It caught a real divergence while being written: the CLI reported truncation in its payload, the tool in `meta`. Same fact, different envelope — rendering, so it is compared ACROSS the envelopes. And it caught a vacuous version of itself: with one pulse `drift` answers INSUFFICIENT_DATA with zero deltas, so the delta comparison was `[]` against `[]` and stayed green when the CLI's limit was mutated from 10 to 3. The fixture pulses TWICE for that reason and asserts the status is not INSUFFICIENT_DATA, which is what makes the mutation fail as it should
- [x] ENFORCED, and it found two real gaps. `conducks drift` had no `--json` at all. `conducks flows --json` emitted a BARE ARRAY, so `[]` meant both "no flows" and "4 exist and none matched" — the denominator was on the rendered path and in the tool and missing from the one surface a machine reads (ADR 0115/0145, CONDUCKS-37). Both fixed; `flows --json` now returns `{flows, total, matching, shown}`, matching the tool field for field
- [x] A third difference turned out to be DESIGNED and is recorded in the test so nobody "fixes" it: `query` returns direct matches plus ECHOES (callers of a match) where the tool returns direct only. The CLI labels them — `match: "direct" | "echo"` in `--json`, a dim `echo` column when rendered — so the shared answer is the direct set. ADR 0148 forbids an agent asking what a person cannot; this is the other direction, which the one-directional rule allows

## Not in scope

- Adding MCP tools for CLI-only commands. The rule is one-directional: every MCP tool is a CLI
  command, not the reverse. `mirror`, `setup`, `install-hooks` and the rest stay CLI-only.
