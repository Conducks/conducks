import { Tool } from "../../core/registry/tool-registry.js";
import { conducks } from "../../../src/conducks-core.js";

/**
 * Conducks Technical Flows (Kinetic)
 * 
 * Exposes behavior and flow intelligence.
 */

export const search_resonance: Tool = {
  id: "search-resonance",
  name: "search_resonance",
  type: "tool",
  version: "1.1.0",
  description: "Search for logic patterns and behavioral concepts using resonance matching. Bypasses text matching to find similar logic paths. WHEN TO USE: Finding all instances of a specific error-handling pattern or locating resonant logic across different modules.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The technical concept or error signature to find." }
    },
    required: ["query"]
  },
  handler: async ({ query }: any) => {
    const results = conducks.query(query);
    return { query, count: results.length, results };
  },
  formatter: (res: any) => {
    if (res.results.length === 0) return `## Resonance Search: ${res.query}\nNo resonant nodes found.`;
    return `## Resonance Search: ${res.query}\nFound **${res.results.length}** resonant nodes:\n${res.results.map((n: any) => `- **${n.properties.name}** [Rank: ${n.properties.rank?.toFixed(2)}] in ${n.properties.filePath}`).join('\n')}`;
  }
};

export const flow_trace: Tool = {
  id: "flow-trace",
  name: "flow_trace",
  type: "tool",
  version: "1.1.0",
  description: "Trace the execution flow from a starting symbol to its terminal state. Returns a step-by-step path. WHEN TO USE: Debugging complex logic flows, understanding how data mutates across functions, or tracing the lifecycle of a request.",
  inputSchema: {
    type: "object",
    properties: {
      symbolId: { type: "string", description: "The starting ID (filePath::name) for the flow trace." }
    },
    required: ["symbolId"]
  },
  handler: async ({ symbolId }: any) => {
    const flows = conducks.trace(symbolId);
    return flows;
  },
  formatter: (res: any) => {
    if (res.exists === false) return `❌ Symbol **${res.startId}** not found in the graph.`;
    return `## Technical Flow: ${res.start}\nFound **${res.totalSteps}** sequential steps:\n${res.steps.map((s: any) => `  ${s.depth}. [${s.type}] **${s.name}** in ${s.filePath}`).join('\n')}`;
  }
};
