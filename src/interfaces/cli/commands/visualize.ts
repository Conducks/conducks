import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
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

  public async execute(args: string[], injectedPersistence: SynapsePersistence): Promise<void> {
    const limitArg = args.find(a => !a.startsWith('--'));
    const limit = limitArg ? parseInt(limitArg, 10) : 30;
    const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

    const persistence: SynapsePersistence = injectedPersistence || new GraphPersistence(targetPath);
    (registry as any).persistence = persistence;
    chronicle.setProjectDir(targetPath);

    try {
      // Resonate to ensure PageRank gravity is calculated on the merged graph
      (registry.infrastructure.graphEngine as any).resonate();

      const graph = registry.intelligence.graph.getGraph();
      const nodes = Array.from(graph.getAllNodes())
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, limit);

      const mermaidLines: string[] = ["graph TD"];
      const edges = new Set<string>();

      // Pre-declare all top nodes as individual boxes
      for (const node of nodes) {
        const sourceId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
        const sourceLabel = node.properties.name || node.id;
        mermaidLines.push(`  ${sourceId}["${sourceLabel}"]`);
      }

      for (const node of nodes) {
        const neighbors = graph.getNeighbors(node.id, 'downstream');
        for (const neighbor of neighbors) {
          if (nodes.find(n => n.id === neighbor.id)) {
            const edgeKey = `${node.id}->${neighbor.id}`;
            if (!edges.has(edgeKey)) {
              // Sanitize IDs for Mermaid
              const source = node.id.replace(/[^a-zA-Z0-9]/g, '_');
              const target = neighbor.id.replace(/[^a-zA-Z0-9]/g, '_');
              
              mermaidLines.push(`  ${source} --> ${target}`);
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
      await persistence.close();
    }
  }
}
