# 0197 — a project declares its own layers
Status: Accepted
- Date: 2026-09-19
- Enforced by: tests/unit/domain/governance/layer-contract.test.ts

## Context

The `layer_boundaries` rule classified a file into a layer by matching path fragments held in
`LAYER_FRAGMENTS` — `/contracts`, `/lib/core`, `/lib/domain`, `/registry`, `/interfaces/cli`,
`/interfaces/tools`, `/interfaces/web`. Those are conducks' own directory names.

Measured on 2026-09-19 (todo77#P7): on two other projects, **zero** dependency edges classified into
any layer, and `conducks guard` printed `✅ Layer contract clean.` and exited 0 — a tick over
nothing. One subject was worse than silent: its 62 classifiable edges were all `src/registry/...`,
classified as `composition` by coincidence of a directory name in an unrelated project.

todo77#P7 closed the dishonesty half: the rule now counts how many files mapped to a layer and, at
zero, emits a `NOT CHECKED` warning instead of a pass. That left the check correct and useless
everywhere but here — the reader was told nothing was examined and given no way to change it. The
reason it was not built was mechanical: the minimal YAML parser in `sentinel-rules.ts` reads
scalars and sequences of flat mappings, and a layer contract was assumed to need nested lists.

## Decision

**A project declares its layers in `.conducks/sentinel.yml`, in the subset the existing parser
already reads:**

```yaml
version: 1
layers:
  - name: contracts
    path: /src/contracts
  - name: domain
    path: /src/domain
    allow: core, contracts
```

`allow` is a comma-separated list of layer names. A layer with no `allow` may depend on nothing
outside itself; same-layer edges are legal without being listed; fragments match in file order, so
the more specific path goes first. `loadLayerContract` (`sentinel-rules.ts`) returns the declared
contract, or the builtin one when no `layers:` key exists, and names which of the two it is so the
output can say so.

**A declared contract that does not hold together checks nothing and reports an error.** A duplicate
layer name, an entry missing `name` or `path`, or an `allow` naming a layer nobody declared each
produce a `NOT CHECKED` error violation naming the problem — never a fall back to the builtin
fragments. A verdict computed from another repository's directory names is worse than no verdict,
and that is precisely the shape this rule already refuses elsewhere.

**Not chosen: a real YAML dependency.** It buys nested maps and a schema, and costs a runtime
dependency in the one file the gate loads on every CI run. The comma-separated `allow` reads
identically to a reader and needs no parser change, so the flat shape was kept until something asks
for nesting that a comma cannot express.

**Not chosen: inferring layers from directory depth.** A tempting zero-config option — treat each
top-level directory under `src/` as a layer — and it was rejected because it invents a contract
nobody wrote. The whole defect this closes was a contract asserting something the project never
declared; deriving one from folder names repeats it with better manners.

**Not chosen: a separate `layers.yml`.** One file already carries the rules the same gate reads; a
second one doubles the places a reader looks and the places a loader can silently miss.

## Consequences

`conducks guard` becomes a usable gate on any project, at the cost of one config block. A project
that declares nothing sees the same `NOT CHECKED` warning as before, now carrying the instruction to
declare `layers:` — the warning stays a warning and still does not block, because a project that
never declared a contract is not in violation of one.

`LAYER_FRAGMENTS` and `ALLOWED_DEPENDENCIES` stay exported and stay conducks' own contract, still
asserted directly by `tests/architecture/boundaries.test.ts`. They are now the fallback rather than
the only contract.

The layer-contract note's "no per-project layer config" deferral is resolved and deleted;
`docs/visuals/modules/domain/governance/sentinel.md` carries the declaration shape instead.
