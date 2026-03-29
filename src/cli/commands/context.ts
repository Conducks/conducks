import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Context (Trace) Command
 */
export class ContextCommand implements ApostleCommand {
  public id = "context";
  public description = "View symbol relationships and technical flows";
  public usage = "conducks context <symbolId>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID (filePath::name) to trace.");
      return;
    }
    await persistence.load(conducks.graph.getGraph());
    const circuit = conducks.trace(symbolId);
    if (circuit.exists === false) {
      console.error(`❌ Symbol Not Found: ${symbolId}`);
      return;
    }
    console.log(`--- Technical Flow Trace: ${circuit.start} ---`);
    circuit.steps.forEach((s: any) => {
      console.log(`  ${s.depth}. [${s.type}] ${s.name} (${s.filePath})`);
    });
  }
}
