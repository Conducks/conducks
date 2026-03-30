import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Cohesion Command
 */
export class CohesionCommand implements ConducksCommand {
  public id = "cohesion";
  public description = "Measure shared structural context between symbols";
  public usage = "registry cohesion <symbolA> <symbolB>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const sourceId = args[0];
    const targetId = args[1];
    if (!sourceId || !targetId) {
      console.log("\x1b[31mError: Two symbols are required for cohesion analysis.\x1b[0m");
      return;
    }

    try {
      await persistence.load(registry.intelligence.graph.getGraph());
      const cohesion = registry.intelligence.getCohesionVector(sourceId, targetId);

      const fmt = (v: any) => {
        const n = Number(v);
        return isNaN(n) ? "0.00" : (n * 100).toFixed(2);
      };

      console.log(`\n\x1b[34mStructural Cohesion Score:\x1b[0m ${fmt(cohesion)}%`);
      console.log(`\x1b[33m- Measuring the degree of shared structural context between symbols.\x1b[0m`);
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await persistence.close();
    }
  }
}
