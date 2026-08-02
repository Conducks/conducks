# 0096 — the dangling rate was measured after deleting the failures
Status: Accepted
- Date: 2026-08-02
- Amends: 0055
- Builds: 0077
- Enforced by: tools/verify-edges.mjs, and `CONDUCKS_NO_SWEEP=1 conducks analyze` — the honest rate must be reported beside the swept one

## Context

Asked to check whether `analyze` improves its own numbers by dropping things, the answer is yes.

`sweepUnresolvedGuesses` (ADR 0055) deletes every dangling edge with confidence below 0.6 at the end
of a pulse. Every dangling figure this project has ever reported was computed AFTER that deletion.

| conducks | edges | dangling | rate |
|---|---|---|---|
| as reported | 17,275 | 198 | **1.15%** |
| sweep disabled | 20,009 | 2,925 | **14.62%** |

**2,734 edges deleted — fourteen times what survives.**

ADR 0055 defends the sweep on a specific claim: what is swept is "a call on a local value —
`line.trim`, `args.includes`, `results.filter` — that names no symbol this project contains", and
"the confidence floor is the whole safety of this", because "an edge at 0.85 or 1.0 that still
dangles is a real reference the resolver could not place — a bug to investigate, not a row to
delete."

**The floor does not do that.** Measured composition of the 2,734:

| | count | |
|---|---|---|
| built-in method on a local | 1,971 (72%) | the stated purpose — legitimate |
| other dotted targets | 403 (15%) | includes real project methods |
| bare names | 360 (13%) | mixed |

`graph.getAllNodes` is swept at confidence 0.4. `getAllNodes` is a real method — `adjacency-list.ts:691`
— its node exists, and three call sites reference it, including `audit.ts` and `entry.ts`. Low
confidence means "the call processor did not resolve this", not "this is a built-in", so genuine
resolution failures inherit 0.4 and are deleted alongside `arr.map`.

## Decision

**Record the honest number, and keep the sweep until it can be split by CAUSE rather than by confidence.**

The sweep stays for now: 72% of what it removes is genuinely unresolvable, and a graph carrying 2,925
permanent danglers is worse to read than one carrying 198. But no figure derived from it may be
quoted as "the dangling rate" without the unswept number beside it.

`CONDUCKS_NO_SWEEP=1` is the escape hatch that produces the honest count.

## Consequences

- **Every dangling figure in this repository's records is a post-sweep figure**, including the ones in
  ADRs 0084, 0085, 0090 and 0094. They are correct as written — they compare like with like across a
  change — but none of them is the share of references conducks fails to resolve. That number is
  **14.6% on conducks**, not 1.15%.
- The source-verification figures (ADR 0095) are UNAFFECTED: they check edges that exist, and a
  deleted edge was never among them. 99.98% remains true and means what it says.
- Splitting the sweep by cause is real work: a built-in method on a local is decidable from the
  receiver, a project method that failed to resolve is not decidable without knowing why. Recorded as
  `todo35` rather than guessed at here.
- **A first attempt at the resolution work it would enable was reverted.** Teaching the linker to
  resolve a receiver that is a typed PARAMETER, and a property that DELEGATES
  (`status: () => governance.status()`), took conducks' deep chains 113 -> 59 and dangling 191 -> 143
  — and took mentorseed from 2 source-contradicted edges to 50. An improvement on the subject it was
  written against and a regression on the one it was not is the definition of overfitting, and it is
  parked in a stash rather than shipped. `todo34` carries the measurement.
