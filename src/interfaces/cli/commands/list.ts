import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — List Command
 */
export class ListCommand implements ConducksCommand {
  public id = "list";
  public description = "List all federated projects";
  public usage = "registry list";

  public async execute(_args: string[], _registry: Registry): Promise<void> {
    // Simplified list for now
    console.log("--- 🌐 Federated Synapses ---");
    console.log("- Foundation (Local)");
  }
}
