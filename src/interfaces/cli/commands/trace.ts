import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Trace Command (Conducks)
 * 
 * Visualizes the structural dependency chain of a symbol.
 */
export class TraceCommand implements ConducksCommand {
  public id = "trace";
  public description = "Visualize the structural dependency chain of a symbol";
  public usage = "registry trace <symbolId> [maxDepth: number]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    const maxDepth = parseInt(args[1]) || 10;
    try {
      const symbolId = args[0];
      const maxDepth = parseInt(args[1]) || 10;

      if (!symbolId) {
        console.error("Error: Please provide a symbol ID to trace.");
        return;
      }

      await persistence.load(registry.intelligence.graph.getGraph());

      let activeId = symbolId;
      let node = registry.intelligence.graph.getGraph().getNode(symbolId);

      // Conducks: Intelligent Fallback Resolve
      if (!node) {
        const results = registry.intelligence.search.search(symbolId, 1);
        if (results.length > 0) {
          node = results[0];
          activeId = node.id;
        }
      }

      const circuit = await (registry.analysis as any).getImpact(activeId, 'downstream', maxDepth);

      if (circuit.exists === false) {
        console.error(`Error: Symbol ${symbolId} not found in the structural index.`);
        return;
      }

      console.log(`\n\x1b[1m--- Conducks Structural Flow Trace: ${symbolId} ---\x1b[0m`);
      console.log(`\x1b[35mTotal Structural Steps:\x1b[0m ${circuit.affectedCount}`);

      if (circuit.affectedNodes.length === 0) {
        console.log(`\x1b[33mNo downstream dependencies found.\x1b[0m`);
        return;
      }

      circuit.affectedNodes.forEach((node: any) => {
        const indent = "  ".repeat(Math.floor(node.distance));
        const typeColor = node.kind === 'function' ? '\x1b[32m' : '\x1b[34m';
        const typeLabel = node.path.length > 0 ? node.path[node.path.length - 1] : 'ROOT';
        console.log(`${indent}${typeColor}└─ [${typeLabel}]\x1b[0m ${node.name} \x1b[90m(${node.filePath})\x1b[0m`);
      });

    } catch (err) {
      console.error(`Trace Error: ${(err as Error).message}`);
    }
  }
}
