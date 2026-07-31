# 0078 — the sweep and the endpoint refusal both belong to the full pulse
Status: Accepted
- Date: 2026-08-01
- Amends: 0050, 0051
- Enforced by: tests/unit/core/persistence/reconcile-unobserved-delete.test.ts (a unit whose file disappeared while nothing was watching is purged by the next incremental analyze, and a micro-pulse writing one file never sweeps)

## Context

ADR 0050 and ADR 0051 each left one question open, and both were carried by `todo25#P7` unanswered
because neither had been costed. They turn out to have the same answer for the same reason, so they
are settled together.

**ADR 0050 asked whether the watcher should ever sweep.** The sweep deletes every row the current
`pulseId` did not touch. A full `analyze` stamps the whole graph, so that is exactly "what is no
longer there". A micro-pulse stamps ONE FILE, so the same operation would delete the entire rest of
the graph. The watcher therefore does not sweep, and the concern recorded was that a file DELETED
between two watcher sessions has no unit to purge and no full pulse to notice it.

**ADR 0051 asked whether `saveEdges` should refuse any edge whose endpoints are absent**, making the
rule structural instead of a convention each binder has to remember.

## Decision

**Neither. Both belong to the end of a full pulse, and both already have a mechanism there.**

### The watcher does not sweep, and the gap it leaves is bounded

MEASURED rather than reasoned about. A file was added, analyzed into the vault (1 node), then moved
away with no watcher running at all — the worst case the question describes — and a plain
incremental `analyze` was run:

```
🛡️ [Persistence] Reconciling: purging 1 unit(s) no longer discoverable.
after deleting file + incremental analyze, probe nodes: 0
```

The reconcile scan catches it on the next `analyze`, without `--force`. So the gap is real but its
duration is "until the next full pulse", and the mechanism that closes it is the one already built
for it. Making the sweep scope-aware for a single file would duplicate `purgeUnits()`, which is what
the watcher already calls for a delete it DOES observe.

### `saveEdges` does not refuse, because at that point it cannot know

The refusal is impossible at the write, not merely inconvenient. Edges are written per WAVE, and the
things that make a dangling endpoint legitimate run after the LAST wave:

| runs | what it does |
|---|---|
| per wave | `saveEdges` — the endpoint may not exist yet |
| after last wave | `IntraLinker` rebinds cross-file references |
| after that | induction materialises genuinely external targets |

An edge to `@heroicons/react::bellicon` is written in wave 1 and its target node is created after
wave 2. A structural refusal in `saveEdges` would reject it as broken. The only ways around that are
to buffer every edge to the end — which defeats the wave flush that exists for memory (ADR 0041) —
or to run induction per wave, which cannot work because induction needs the whole graph to know what
is still unresolved.

So the rule is enforced where the information exists, at the end of the pulse, in two bands that
already ship:

| band | mechanism | outcome |
|---|---|---|
| guess confidence (< 0.6) | `sweepUnresolvedGuesses` (ADR 0055) | deleted — `line.trim`, `args.includes` |
| high confidence, still dangling | `audit` REFACTOR-2 | reported as a finding, not deleted |

That split is the substance of the original question and it is better than a blanket refusal would
have been: a high-confidence edge that still dangles is a resolver BUG worth seeing, and refusing it
at write time would have hidden exactly the signal that found the six misresolved package imports in
ADR 0077.

## Consequences

- `todo25#P7`'s two questions are closed as decisions rather than deferred work. Neither becomes a
  build.
- The watcher's delete handling is `purgeUnits()` for observed deletes and the next pulse's reconcile
  for unobserved ones. Nothing else is needed and a scope-aware sweep is explicitly not wanted.
- `saveEdges` stays permissive by design, and the comment at the sweep says so, so the next reader
  does not re-propose the refusal without re-reading the ordering.
- **What is still not covered:** a project that is watched but never fully analyzed again keeps its
  phantoms indefinitely. That is a scheduling question about how often `analyze` runs, not a defect
  in either mechanism, and no todo carries it yet.
