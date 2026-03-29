import { Tool } from "../../core/registry/tool-registry.js";
import { conducks } from "../../../src/conducks-core.js";
import { DAACClustering } from "../../core/algorithms/clustering/daac.js";
import { GVREngine } from "../../core/algorithms/refactor/gvr-engine.js";

/**
 * Conducks Technical Layer (Graph)
 * 
 * Exposes advanced structural intelligence tools for mapping and refactoring.
 */

export const graph_query: Tool = {
  id: "graph-query",
  name: "graph_query",
  type: "tool",
  version: "1.3.0",
  description: "Query the code knowledge graph for execution flows and structural concepts. Returns symbols and their locations. WHEN TO USE: Discovering entry points, identifying where a feature is implemented, or exploring unfamiliar code architecture.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural language concept or exact symbol name to find (e.g., 'auth validation' or 'SynapseEngine')." }
    },
    required: ["query"]
  },
  handler: async ({ query }: any) => {
    const results = conducks.query(query);
    return { query, results, total: conducks.status().stats.nodeCount };
  },
  formatter: (res: any) => {
    if (res.results.length === 0) return `## Search Query: ${res.query}\nNo direct resonance found in ${res.total} symbols.`;
    return `## Search Query: ${res.query}\nFound **${res.results.length}** resonant symbols:\n${res.results.map((n: any) => `- **${n.properties.name}** [${n.label}] in ${n.properties?.filePath}`).join('\n')}`;
  }
};

export const graph_context: Tool = {
  id: "graph-context",
  name: "graph_context",
  type: "tool",
  version: "1.3.0",
  description: "Get a 360-degree technical view of a specific symbol. Shows heritage, exports, and impact. WHEN TO USE: Deep-diving into a suspect function during debugging or understanding the 'parents' and 'children' of a class.",
  inputSchema: {
    type: "object",
    properties: {
      symbolId: { type: "string", description: "The unique ID (filePath::name) to analyze." }
    },
    required: ["symbolId"]
  },
  handler: async ({ symbolId }: any) => {
    const node = conducks.graph.getGraph().getNode(symbolId);
    if (!node) return { symbolId, exists: false };
    return { 
      symbolId, 
      exists: true, 
      label: node.label,
      props: node.properties,
      impact: conducks.getImpact(symbolId, 1)
    };
  },
  formatter: (res: any) => {
    if (!res.exists) return `❌ Symbol **${res.symbolId}** not found in the graph.`;
    const p = res.props;
    return `## Technical Context: ${res.symbolId}\n- **Heritage**: ${p.heritage?.join(' -> ') || 'None'}\n- **Exported**: ${p.isExport ? 'Yes' : 'No'}\n- **Location**: ${p.filePath}\n\n### 🔄 Immediate Blast Radius\nFound **${res.impact.affectedCount}** direct dependents requiring updates if this symbol changes.`;
  }
};

export const graph_impact: Tool = {
  id: "graph-impact",
  name: "graph_impact",
  type: "tool",
  version: "1.3.0",
  description: "Analyze the blast radius of modifying a code symbol. Returns affected symbols grouped by depth and a risk assessment. WHEN TO USE: Before any refactor or non-trivial edit to ensure you don't break downstream dependencies.",
  inputSchema: {
    type: "object",
    properties: {
      symbolId: { type: "string", description: "The suspect symbol to analyze for upstream impact." },
      depth: { type: "number", description: "Max traversal depth (default 3)." }
    },
    required: ["symbolId"]
  },
  handler: async ({ symbolId, depth }: any) => {
    return conducks.getImpact(symbolId, depth || 3);
  },
  formatter: (res: any) => {
    return `## Impact Analysis: ${res.targetId}\n- **Risk Level**: ${res.risk}\n- **Architecture Gravity**: ${res.impactScore}\n- **Affected Symbols**: ${res.affectedCount}`;
  }
};

export const graph_groups: Tool = {
  id: "graph-groups",
  name: "graph_groups",
  type: "tool",
  version: "1.1.0",
  description: "Detect functional areas (communities) in the codebase. Maps folders to logical domains like Auth, API, or Storage.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const daac = new DAACClustering();
    const clusters = daac.cluster(conducks.graph.getGraph());
    return { count: clusters.size, clusters: Array.from(clusters.entries()) };
  },
  formatter: (res: any) => `## Functional Group Mapping\nDetected **${res.count}** cohesive communities based on structural proximity.`
};

export const graph_refactor: Tool = {
  id: "graph-refactor",
  name: "graph_refactor",
  type: "tool",
  version: "1.2.0",
  description: "Perform an atomic rename of a symbol across the entire project with safety checks. WHEN TO USE: Coordinated multi-file renames with 100% confidence.",
  inputSchema: {
    type: "object",
    properties: {
      symbolId: { type: "string", description: "ID of the target symbol (filePath::name)." },
      newName: { type: "string", description: "The new name for the symbol." }
    },
    required: ["symbolId", "newName"]
  },
  handler: async ({ symbolId, newName }: any) => {
    const gvr = new GVREngine();
    return gvr.renameSymbol(conducks.graph.getGraph(), symbolId, newName);
  },
  formatter: (res: any) => {
    if (!res.success) return `❌ Refactor Failed: ${res.message}`;
    return `## Refactor Complete\n- **Action**: Renamed to **${res.newName}**\n- **Files Updated**: ${res.affectedFiles.length}`;
  }
};

export const verify_audit: Tool = {
  id: "verify-audit",
  name: "verify_audit",
  type: "tool",
  version: "1.1.0",
  description: "Audit project integrity. Checks for circular dependencies, structural leaks, and architectural violations.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    return conducks.audit();
  },
  formatter: (res: any) => {
    if (res.success) return `✅ **Verification Passed**: No structural violations detected.`;
    return `## ⚠️ Architecture Violations\nFound **${res.violations.length}** issues:\n${res.violations.map((v: any) => `- ${v}`).join('\n')}`;
  }
};

export const blueprint_gen: Tool = {
  id: "blueprint-gen",
  name: "blueprint_gen",
  type: "tool",
  version: "1.1.0",
  description: "Generate the technical BLUEPRINT. Creates a high-fidelity structural manifest of all symbols and their hierarchy.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    return conducks.generateBlueprint();
  },
  formatter: (res: any) => res as string
};
