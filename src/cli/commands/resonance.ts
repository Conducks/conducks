import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Resonance (Compare) Command
 */
export class ResonanceCommand implements ApostleCommand {
  public id = "resonance";
  public description = "Compare structure to another foundation project";
  public usage = "conducks resonance <path>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const otherPath = args[0];
    if (!otherPath) {
      console.error("Error: Please provide a path to a linked foundation project to compare.");
      return;
    }
    
    await persistence.load(conducks.graph.getGraph());
    const diff = await conducks.compare(otherPath);
    console.log(`\n\x1b[1m--- 📡 Project Resonance: Comparison ---\x1b[0m`);
    console.log(`- Resonance Score: ${diff.similarity}%`);
    console.log(`- Summary: ${diff.summary}`);
    console.log(`\x1b[33m- Metrics: Density (${Math.round(diff.metrics.density * 100)}%), Typology (${Math.round(diff.metrics.typology * 100)}%)\x1b[0m`);
  }
}
