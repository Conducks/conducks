import { Tool } from "../../core/registry/tool-registry.js";
import { conducks } from "../../../src/conducks-core.js";

/**
 * Apostle — Structural Oversight Tooling 💎
 * 
 * Provides high-level architectural intelligence for AI agents.
 */

export const find_structural_hotspots: Tool = {
  id: "find-structural-hotspots",
  name: "find_structural_hotspots",
  type: "tool",
  version: "1.0.0",
  description: "Identify the top 10 structural anchors (hotspots) in the codebase based on PageRank 'Kinetic Gravity'. WHEN TO USE: Prioritizing refactoring efforts or identifying central hubs that cause system-wide fragility.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const graph = conducks.graph.getGraph();
    const nodes = Array.from(graph.getAllNodes());
    const hotspots = nodes
      .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
      .slice(0, 10)
      .map(n => ({
        id: n.id,
        name: n.properties.name,
        gravity: n.properties.rank,
        kind: n.label,
        file: n.properties.filePath
      }));
    return { hotspots };
  },
  formatter: (res: any) => {
    return `### 💎 Structural Hotspots (Top 10)\n${res.hotspots.map((h: any) => `- **${h.name}** [${h.kind}] (Gravity: ${(h.gravity * 100).toFixed(2)}%) in ${h.file}`).join('\n')}`;
  }
};

export const detect_architectural_lies: Tool = {
  id: "detect-architectural-lies",
  name: "detect_architectural_lies",
  type: "tool",
  version: "1.0.0",
  description: "Detect 'Architectural Lies' — hidden couplings between files that change together but have no explicit code relationships. WHEN TO USE: Identifying technical debt that static analysis tools miss.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const findings = await conducks.advise();
    return { findings };
  },
  formatter: (res: any) => {
    if (res.findings.length === 0) return `✅ No hidden architectural lies detected. Structure and behavior are in sync.`;
    return `### ⚠️ Architectural Lies (Hidden Coupling)\n${res.findings.map((f: any) => `- ${f}`).join('\n')}`;
  }
};

export const analyze_pr_risk: Tool = {
  id: "analyze-pr-risk",
  name: "analyze_pr_risk",
  type: "tool",
  version: "1.0.0",
  description: "Calculate the total architectural risk of a proposed Pull Request based on the gravity and entropy of changed files. WHEN TO USE: Validating if a set of changes is safe to merge or requires extreme caution.",
  inputSchema: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string" }, description: "List of file paths changed in the PR." }
    },
    required: ["files"]
  },
  handler: async ({ files }: any) => {
    const graph = conducks.graph.getGraph();
    const affectedNodes = Array.from(graph.getAllNodes()).filter(n => 
      files.includes(n.properties.filePath)
    );

    const risks = await Promise.all(
      affectedNodes.map(async n => ({
        node: n.properties.name,
        file: n.properties.filePath,
        risk: await conducks.calculateCompositeRisk(n.id)
      }))
    );

    const totalRisk = risks.reduce((acc, r) => acc + (r.risk?.score || 0), 0) / (risks.length || 1);

    return {
      severity: totalRisk > 0.7 ? "CRITICAL" : totalRisk > 0.4 ? "MEDIUM" : "LOW",
      score: totalRisk,
      impacted_areas: risks
    };
  },
  formatter: (res: any) => {
    return `### 🛡️ PR Architectural Risk: **${res.severity}** (Score: ${res.score.toFixed(2)})\nAnalyzed **${res.impacted_areas.length}** high-gravity symbols affected by this change.`;
  }
};

