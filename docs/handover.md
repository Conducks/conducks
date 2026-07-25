# Handover — 2026-07-25
Status: current

## Where it stands
- **todo14 closed** (single-thread, no subagents). STALE_IMPORT recall 1 → **18 findings, 0 false
  positives**, strict subset of tsc's 75+5. The 4 first-pass FPs were each a distinct capture gap —
  generic constraint, nested generic in type_arguments, local type re-export, for-of reads — all
  probed and closed. Canary suite pins every type position + isTypeOnly classification.
- **`isConstructor` fixed**: every capitalized dotted call (Math.random, JSON.parse) was typed
  CONSTRUCTS; dotted is never a constructor. Dotted static calls resolve via the object segment —
  `GraphTraversal.traverseUpstream` finally carries a CALLS edge (weighted distance 1.00 verified).
  Governance unchanged by the bulk edge-type shift (audit + guard clean, prune stable).
- **`.js`/`.jsx` settled on JavaScriptProvider in BOTH maps.** JavaScriptProvider was never in the
  registry precedence list — `.js` had ridden on the TS provider's claim. The undefined-dispatch
  window this opened was caught by live verification and never landed.
- **Dead code deleted with proof**: `extensionToGrammar` (sole ref = its own definition) and the
  reflector's node-creation suffix override (definition captures always win; the LIVE Gnosis
  fallback heuristic at reflector.ts:~770 is untouched and marked).
- Suite 152 → **158**, all gates green: typecheck 0 · audit confirmed · guard layer-clean ·
  docs-lint clean.

## Next, in order
1. **todo07 — workspace rollout** (needs the scope lift; it pulses other repos).
2. `tests/legacy` still holds two archived files referencing deleted GQL symbols (ignored by
   tsc+jest; cosmetic).
3. Recall beyond 18: the remaining tsc-only findings are mostly type-declaration imports used in
   positions the graph still cannot see (satisfies, mapped types, template-literal types) plus
   non-import locals tsc counts and we do not. Diminishing returns — extend only with the same
   probe → canary → subset-revalidation loop.
