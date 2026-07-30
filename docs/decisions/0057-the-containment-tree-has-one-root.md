# 0057 — the containment tree has one root
Status: Accepted
- Enforced by: tests/integration/features/pulse-writes-every-table.test.ts (exactly one node in the vault has no parent)
- Builds: 0056
- Date: 2026-07-31

## Context

After ADR 0056 repaired the self-parenting units, 51 nodes still had no parent at all: 32 ECOSYSTEM
package nodes and 19 `lib::<namespace>` roots. `ecosystem::global` already existed and already served
as the root of the code side — `repository::conducks` hangs off it — so the external side was simply
never attached to anything.

The consequence is that the graph was a FOREST, not a tree. A walk from any external symbol ran out
of parents before reaching a root, so anything answering "what is this under" returned a fallback for
every external reference, and "show me everything external" had no subtree to ask for.

External nodes are created in THREE places, which is why fixing the obvious two moved the count from
51 to 32 and no further:

| creator | produces |
|---|---|
| `essence-lens` | ECOSYSTEM nodes from `package.json` / `requirements.txt` |
| `induceVirtualLibraries` | `lib::<namespace>` roots for external symbols |
| `reflection-pipeline` | ECOSYSTEM boundary nodes when an import resolves to a package |

The third is the one that actually produced the 32 here, and it was the last one found.

## Decision

**Every external node hangs off `ecosystem::global`**, which is the single root of the containment
tree. All three creation paths set it.

**Not chosen: a separate `ecosystem::external` root beside `ecosystem::global`.** It reads tidier —
"ours" and "theirs" as siblings — and it re-creates the forest with two trees instead of many. The
value of one root is that every walk terminates in the same place; splitting it costs exactly that.

**Not chosen: leaving them parentless and special-casing the walks.** Every consumer that walks
parents would need to know that a null parent is normal for one class of node. That is the same
"every reader must remember the rule" failure ADR 0056 rejected for containment generally.

**Not chosen: consolidating the three creation paths first.** They should probably be one, and that
is a refactor with its own risk; parenting them is three one-line changes that can be verified by
counting. The consolidation is worth doing and is not this.

## Consequences

One node in the vault now has no parent — `ecosystem::global` itself, which is correct and is what
the enforcing test asserts. Any code that treated "no parent" as "external" is now wrong; the test
pins the count at one so that assumption fails loudly rather than silently.

The ECOSYSTEM tier gained 58 children in the mirror's wave, so cluster sizes and any depth-derived
value shift again. Combined with ADR 0056, depth and cluster figures from before 31 Jul are not
comparable to those after it.

The mirror's `ecosystem::global` bucket did NOT change (56 nodes) — the external nodes now have a
parent but they sit at rank 0 and the wave already grouped them there. That is worth stating because
it would be easy to claim this fix improved the visual, and it did not.

`Open:` the three creation paths remain three. A single "external node" factory would make the next
property added to these nodes land in one place instead of three, and would have made this record a
one-line change rather than a hunt. Carried by todo25#P11.
