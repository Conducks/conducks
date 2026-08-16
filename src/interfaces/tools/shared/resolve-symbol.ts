import { registry } from "@/registry/index.js";
import { tryResolveSymbol, type NameIndex } from "@/contracts/index.js";

/**
 * Conducks — the one place a caller-supplied symbol becomes a graph node id.
 *
 * There were three copies of this rule (kinetic.ts, synapse.ts, and a fourth inline one inside
 * `conducks_context`) and every copy carried the same hole: anything containing `::` was returned
 * lowercased WITHOUT asking the graph whether such a node exists. Measured over stdio JSON-RPC on
 * 2026-08-09, the invented id `nosuchfile.ts::totallyMadeUpSymbol` made `trace` answer "0 steps",
 * `impact` answer "0 affected", `context` answer "total_in_radius: 0" and `explain` answer with no
 * risk fields at all — four confident nothings for a symbol that was never there. That is ADR 0145's
 * denominator problem one level down: "nothing found" and "nothing looked at" printed the same.
 *
 * One copy, for the reason the SQL guard's multi-statement hole survived: a validation rule split
 * across files drifts, and neither half covers the gap.
 *
 * Returns a VERIFIED node id, or `null` — and `null` must reach the caller as SYMBOL_NOT_FOUND,
 * never as an empty result set.
 */
export function resolveSymbolId(symbol: string): string | null {
  return resolveSymbolWith(symbol, registry.infrastructure.graphEngine.getGraph());
}

/**
 * The rule itself, over any graph — ONE rule, shared with the CLI.
 *
 * This file used to hold a SECOND implementation, and the two drifted the moment either was fixed:
 * teaching the CLI to honour a repo-relative id (`src/kernel/index.ts::createLogger`) left this
 * surface rejecting the same input, which the mirror rule forbids — same input, same answer,
 * differing only in rendering (ADR 0148, todo61).
 *
 * The property this copy was written for SURVIVES the merge, and is asserted rather than assumed:
 * an INVENTED id resolves to null on both surfaces. `tryResolveSymbol` refuses a path that holds no
 * such symbol, which is exactly the `nosuchfile.ts::totallyMadeUpSymbol` case that made four tools
 * answer a confident zero (ADR 0145).
 *
 * Split from `resolveSymbolId` only so it can be driven against a fixture graph — the registry
 * version needs a materialised vault, which is not what a rule of this shape should require to test.
 */
export function resolveSymbolWith(symbol: string, graph: NameIndex): string | null {
  return tryResolveSymbol(symbol, graph);
}
