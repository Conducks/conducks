import { ApostleCommand } from "../command.js";

/**
 * Conducks — List Command
 */
export class ListCommand implements ApostleCommand {
  public id = "list";
  public description = "List all federated projects";
  public usage = "conducks list";

  public async execute(_args: string[], _persistence: any): Promise<void> {
    // Simplified list for now
    console.log("--- 🌐 Federated Synapses ---");
    console.log("- Foundation (Local)");
  }
}
