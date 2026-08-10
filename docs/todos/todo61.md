# todo61 — every MCP capability must exist on the CLI, and answer the same
Status: todo
- Acceptance: for all 12 paired capabilities, every MCP parameter has a CLI equivalent, the enum vocabularies match, and driving both on the same input yields the same ANSWER SET — differing only in rendering. Proven by an equivalence test, not by inspection.
- Builds: 0005

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
| `audit` | `scan`/`advice`/`guard`/`archeology` modes, `threshold` | CLI exposes `--fallback` and `--history` only |
| `coverage` | `limit` | |
| `status` | vocabularies DIFFER | MCP `health\|map\|manifest\|pulse`; CLI `pulse\|blueprint` |
| `rename` | safety INVERTED | MCP `dryRun` opt-in; CLI `--confirm` opt-out |
| `diff` | different features | CLI has `--base/--head` pulse compare; MCP has `drift`. Neither has the other |

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
- [ ] `context` is NOT a flag gap, and adding those flags would make it worse. The two surfaces answer
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
- [ ] `audit`: expose the full mode set and `--threshold`.
- [x] `coverage` takes `--limit <n>`, capping only the LIST — the summary counts still describe the
      full bound set (750 functions), the same split the tool makes between `functions` and `summary`,
      and the CLI says how many it held back.
- [ ] `status`: RECONCILE the vocabularies rather than adding to either — decide one set of mode names
      and make both surfaces speak it. This is the only gap that is a naming decision rather than a
      missing flag.
- [ ] `rename`: settle the safety direction. Opt-in `--dry-run` and opt-out `--confirm` are opposite
      defaults for a DESTRUCTIVE command, and a caller moving between surfaces will get it wrong.
- [ ] `diff`: decide whether pulse-compare belongs on the tool and `drift` on the CLI, or whether they
      stay deliberately different and the pairs gate grants an exception with a reason.

## Phase 2 — enforce it, since inspection rots

- [ ] Strengthen `paired-surfaces.test.ts` from "shares one registry accessor" to "reaches the same
      domain function". The current check is too weak to catch divergence and says so in its own
      comment.
- [ ] Add an EQUIVALENCE test: drive both surfaces on the same input and assert the answer sets match.
      Rendering differs by design — the CLI returns source lines for `context`, the tool returns a
      token budget — so compare the ids/findings, not the payloads.
- [ ] `--json` on the CLI is the honest comparison point: it is the CLI's machine surface and should be
      the same data the tool returns.

## Not in scope

- Adding MCP tools for CLI-only commands. The rule is one-directional: every MCP tool is a CLI
  command, not the reverse. `mirror`, `setup`, `install-hooks` and the rest stay CLI-only.
