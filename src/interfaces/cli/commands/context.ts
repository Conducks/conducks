import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph, closePersistence } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";

/**
 * Conducks — Context (Trace) Command
 */
export class ContextCommand implements ConducksCommand {
  public id = "context";
  public description = "View symbol relationships and technical flows";
  public usage = "conducks context <symbolId> [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const symbolId = args.find(a => !a.startsWith('--'));
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID (filePath::name) to trace.");
      process.exit(1);
    }

    try {
      await syncGraph(registry);
      const g = registry.query.graph.getGraph();
      const resolvedId = resolveSymbol(symbolId, g);
      const steps = registry.kinetic.trace(resolvedId);

      if (steps.length === 0) {
        if (useJson) {
          process.stdout.write(JSON.stringify({ symbolId: resolvedId, steps: [] }, null, 2) + '\n');
          return;
        }
        console.error(`❌ No flows found for: ${resolvedId}`);
        process.exit(1);
      }

      if (useJson) {
        process.stdout.write(JSON.stringify({
          symbolId: resolvedId,
          steps: steps.map((id: string, i: number) => {
            const node = g.getNode(id);
            return {
              order: i + 1,
              id,
              label: node?.label || 'node',
              name: node?.properties?.name || id,
              filePath: node?.properties?.filePath || null,
            };
          }),
        }, null, 2) + '\n');
        return;
      }

      console.log(`--- Technical Flow Trace: ${resolvedId} ---`);
      steps.forEach((id: string, i: number) => {
        const node = g.getNode(id);
        console.log(`  ${i + 1}. ${node?.label || 'node'} ${node?.properties?.name || id} (${node?.properties?.filePath || 'unknown'})`);
      });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await closePersistence(registry);
    }
  }
}

