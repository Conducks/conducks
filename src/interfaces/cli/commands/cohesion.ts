import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Cohesion Command
 */
export class CohesionCommand implements ConducksCommand {
  public id = "cohesion";
  public description = "Calculate structural similarity between two symbols";
  public usage = "conducks cohesion <id1> <id2>";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const s1 = args[0];
    const s2 = args[1];

    if (!s1 || !s2) {
      console.error("Error: Please provide two symbol IDs.");
      return;
    }

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());

    try {
      const vector = registry.explain.getCohesionVector(s1, s2);
      console.log(`\n\x1b[1m--- Structural Cohesion Report ---\x1b[0m`);
      console.log(`\x1b[35mVector Similarity:\x1b[0m ${(vector * 100).toFixed(2)}%`);
    } catch (err) {
      console.error(`Cohesion Error: ${(err as Error).message}`);
    }
  }
}
