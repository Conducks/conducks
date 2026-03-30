import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Entropy Command
 */
export class EntropyCommand implements ConducksCommand {
  public id = "entropy";
  public description = "Measure the structural risk of a symbol";
  public usage = "registry entropy <symbolId>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.log("\x1b[31mError: No symbol specified for entropy analysis.\x1b[0m");
      return;
    }
    await persistence.load(registry.intelligence.graph.getGraph());
    const { entropy, risk } = await registry.metrics.calculateEntropy(symbolId);

    const fmt = (v: any) => isNaN(Number(v)) ? "0.00" : (Number(v) * 100).toFixed(2);

    console.log(`\n\x1b[35mStructural Entropy (${symbolId}):\x1b[0m ${entropy.toFixed(4)}`);
    console.log(`\x1b[33mOwnership Risk Factor:\x1b[0m ${fmt(risk)}%`);
    console.log(`\x1b[34m- Note: This measures social fragmentation and ownership drift.\x1b[0m`);
  }
}
