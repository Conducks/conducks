import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Context (Trace) Command
 */
export class ContextCommand implements ConducksCommand {
  public id = "context";
  public description = "View symbol relationships and technical flows";
  public usage = "registry context <symbolId>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID (filePath::name) to trace.");
      return;
    }

    try {
      await persistence.load(registry.intelligence.graph.getGraph());
      const circuit = registry.kinetic.flows.trace(symbolId);
      if (circuit.exists === false) {
        console.error(`❌ Symbol Not Found: ${symbolId}`);
        return;
      }
      console.log(`--- Technical Flow Trace: ${circuit.start} ---`);
      circuit.steps.forEach((s: any) => {
        console.log(`  ${s.depth}. [${s.type}] ${s.name} (${s.filePath})`);
      });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await persistence.close();
    }
  }
}
