import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Resonance (Compare) Command
 */
export class ResonanceCommand implements ConducksCommand {
  public id = "resonance";
  public description = "Compare structure to another foundation project";
  public usage = "registry resonance <path>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const otherPath = args[0];
    if (!otherPath) {
      console.error("Error: Please provide a path to a linked foundation project to compare.");
      return;
    }
    
    await persistence.load(registry.intelligence.graph.getGraph());
    const diff = await registry.intelligence.compare(otherPath);
    console.log(`\n\x1b[1m--- 📡 Project Resonance: Comparison ---\x1b[0m`);
    console.log(`- Resonance Score: ${diff.similarity || 0}%`);
    console.log(`- Summary: ${diff.summary}`);
    console.log(`\x1b[33m- Metrics: Density (${Math.round((diff.metrics?.density || 0) * 100)}%), Typology (${Math.round((diff.metrics?.typology || 0) * 100)}%)\x1b[0m`);
  }
}
