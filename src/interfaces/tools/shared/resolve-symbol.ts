import { registry } from "@/registry/index.js";

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
  const graph = registry.infrastructure.graphEngine.getGraph();
  const asId = symbol.toLowerCase();

  // An id is a resolution only if the graph holds it.
  if (symbol.includes('::')) return graph.getNode(asId) ? asId : null;

  // 58 node ids on this repo carry no `::` (`path.dirname`, `fs.readfilesync` — the ecosystem
  // nodes), and each stores its id as its own `name`, so the name lookup already reaches them. No
  // id-shaped fallback is needed beyond this.
  const matches = graph.findNodesByName(symbol);
  if (matches.length === 0) return null;
  return matches.reduce((a: any, b: any) =>
    ((b.properties?.gravity ?? 0) > (a.properties?.gravity ?? 0) ? b : a)
  ).id as string;
}
