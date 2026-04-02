import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { TraceAnalyzer } from "@/lib/domain/kinetic/trace.js";

/**
 * Conducks — Context (Trace) Command
 */
export class ContextCommand implements ConducksCommand {
  public id = "context";
  public description = "View symbol relationships and technical flows";
  public usage = "registry context <symbolId>";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID (filePath::name) to trace.");
      return;
    }

    try {
      const g = registry.query.graph.getGraph();
      // Structural Sync via Registry Bridge
      await registry.infrastructure.persistence.load(g);
      const analyzer = new TraceAnalyzer(g);
      const steps = analyzer.trace(symbolId);
      
      if (steps.length === 0) {
        console.error(`❌ Symbol Not Found or No Flows: ${symbolId}`);
        return;
      }

      console.log(`--- Technical Flow Trace: ${symbolId} ---`);
      steps.forEach((id: string, i: number) => {
        const node = g.getNode(id);
        console.log(`  ${i + 1}. ${node?.label || 'node'} ${node?.properties?.name || id} (${node?.properties?.filePath || 'unknown'})`);
      });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await registry.infrastructure.persistence.close();
    }
  }
}

