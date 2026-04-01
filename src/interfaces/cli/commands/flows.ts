import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Flows Command (Behavioral Processes)
 */
export class FlowsCommand implements ConducksCommand {
  public id = "flows";
  public description = "List behavioral processes across the Synapse";
  public usage = "registry flows";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(registry.query.graph.getGraph());
    const processes = registry.kinetic.getProcesses();
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
