import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Entropy Command
 */
export class EntropyCommand implements ApostleCommand {
  public id = "entropy";
  public description = "Measure the structural risk of a symbol";
  public usage = "conducks entropy <symbolId>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.log("\x1b[31mError: No symbol specified for entropy analysis.\x1b[0m");
      return;
    }
    await persistence.load(conducks.graph.getGraph());
    const { entropy, risk } = await conducks.calculateEntropy(symbolId);
    console.log(`\n\x1b[35mStructural Entropy (${symbolId}):\x1b[0m ${entropy.toFixed(4)}`);
    console.log(`\x1b[33mOwnership Risk Factor:\x1b[0m ${(risk * 100).toFixed(1)}%`);
    console.log(`\x1b[34m- Note: This measures social fragmentation and ownership drift.\x1b[0m`);
  }
}
