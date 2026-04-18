import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import path from "node:path";
import fs from "fs-extra";

/**
 * Conducks — Visualize Command (The Structural Mirror)
 */
export class VisualizeCommand implements ConducksCommand {
  public id = "visualize";
  public description = "Generate a static Mermaid structural mirror";
  public usage = "registry visualize [limit]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const limitArg = args.find(a => !a.startsWith('--'));
    const limit = limitArg ? parseInt(limitArg, 10) : 30;
    const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

    chronicle.setProjectDir(targetPath);

    try {
      // Resonate to ensure PageRank gravity is calculated on the merged graph
      (registry.infrastructure.graphEngine as any).resonate();

      const graph = registry.query.graph.getGraph();
      const nodes = Array.from(graph.getAllNodes() as Iterable<any>)
        .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, limit);

      const mermaidLines: string[] = ["graph TD"];
      const edges = new Set<string>();
      const renderedNodes = new Set<string>();

      // Register a node definition Helper
      const registerNode = (n: any) => {
        if (!renderedNodes.has(n.id)) {
          const sourceId = n.id.replace(/[^a-zA-Z0-9]/g, '_');
          const sourceLabel = n.properties?.name || n.id;
          mermaidLines.push(`  ${sourceId}["${sourceLabel}"]`);
          renderedNodes.add(n.id);
        }
      };

      // 1. Seed the core requested nodes
      for (const node of nodes) {
        registerNode(node);
      }

      // 2. Expand exactly 1 connection layer deep for the hubs
      for (const node of nodes) {
        const outEdges = graph.getNeighbors(node.id, 'downstream') as any[];
        const inEdges = graph.getNeighbors(node.id, 'upstream') as any[];
        
        // Handle Downstream (Node -> Target)
        for (const edge of outEdges) {
            const targetNode = graph.getNode(edge.targetId);
            if (targetNode) {
              registerNode(targetNode);
              const sourceKey = node.id.replace(/[^a-zA-Z0-9]/g, '_');
              const targetKey = targetNode.id.replace(/[^a-zA-Z0-9]/g, '_');
              const edgeKey = `${sourceKey}->${targetKey}`;
              
              if (!edges.has(edgeKey)) {
                mermaidLines.push(`  ${sourceKey} --> ${targetKey}`);
                edges.add(edgeKey);
              }
            }
        }
        
        // Handle Upstream (Source -> Node)
        for (const edge of inEdges) {
            const sourceNode = graph.getNode(edge.sourceId);
            if (sourceNode) {
              registerNode(sourceNode);
              const sourceKey = sourceNode.id.replace(/[^a-zA-Z0-9]/g, '_');
              const targetKey = node.id.replace(/[^a-zA-Z0-9]/g, '_');
              const edgeKey = `${sourceKey}->${targetKey}`;
              
              if (!edges.has(edgeKey)) {
                mermaidLines.push(`  ${sourceKey} --> ${targetKey}`);
                edges.add(edgeKey);
              }
            }
        }
      }

      const content = mermaidLines.join('\n');
      const artifactPath = path.join(targetPath, '.conducks', 'structural_mirror.md');
      
      await fs.outputFile(artifactPath, `# Structural Mirror — Federated Pulse\n\n\`\`\`mermaid\n${content}\n\`\`\`\n`, 'utf-8');
      
      console.log(`\x1b[32m✅ Structural Mirror generated successfully at: ${artifactPath}\x1b[0m`);
      console.log(`- Nodes Visualized: ${nodes.length}`);
      console.log(`- Federated Pulse: Active`);
    } finally {
      await registry.infrastructure.persistence.close();
    }
  }
}
