import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Trace Command (Apostle v3.B)
 * 
 * Visualizes the structural dependency chain of a symbol.
 */
export class TraceCommand implements ApostleCommand {
  public id = "trace";
  public description = "Visualize the structural dependency chain of a symbol";
  public usage = "conducks trace <symbolId> [maxDepth: number]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    const maxDepth = parseInt(args[1]) || 10;

    if (!symbolId) {
      console.error("Error: Please provide a symbol ID to trace.");
      return;
    }
    
    await persistence.load(conducks.graph.getGraph());
    
    try {
      const circuit = conducks.flows.trace(symbolId, maxDepth);

      if (circuit.exists === false) {
        console.error(`Error: Symbol ${symbolId} not found in the structural index.`);
        return;
      }

      console.log(`\n\x1b[1m--- Apostle Structural Flow Trace: ${symbolId} ---\x1b[0m`);
      console.log(`\x1b[35mTotal Structural Steps:\x1b[0m ${circuit.totalSteps}`);
      
      if (circuit.steps.length === 0) {
        console.log(`\x1b[33mNo downstream dependencies found.\x1b[0m`);
        return;
      }

      circuit.steps.forEach((step: any) => {
        const indent = "  ".repeat(step.depth);
        const typeColor = step.type === 'CALLS' ? '\x1b[32m' : '\x1b[34m';
        console.log(`${indent}${typeColor}└─ [${step.type}]\x1b[0m ${step.name} \x1b[90m(${step.filePath})\x1b[0m`);
      });

    } catch (err) {
      console.error(`Trace Error: ${(err as Error).message}`);
    }
  }
}
