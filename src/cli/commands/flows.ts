import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Flows Command (Behavioral Processes)
 */
export class FlowsCommand implements ApostleCommand {
  public id = "flows";
  public description = "List behavioral processes across the Synapse";
  public usage = "conducks flows";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(conducks.graph.getGraph());
    const processes = conducks.getProcesses();
    console.log("\x1b[1m--- 🌊 Behavioral Processes ---\x1b[0m");
    
    for (const [name, members] of Object.entries(processes)) {
      const list = members as string[];
      if (list.length < 2) continue; // Hide noise
      console.log(`\x1b[35m- ${name} Flow (${list.length} symbols)\x1b[0m`);
      list.slice(0, 5).forEach((m: string) => console.log(`  └─ ${m}`));
      if (list.length > 5) console.log(`  ... and ${list.length - 5} more`);
    }
  }
}
