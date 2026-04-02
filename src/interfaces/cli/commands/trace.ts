import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Trace (Lineage) Command
 * 
 * Maps the execution flow downstream or data lineage upstream.
 */
export class TraceCommand implements ConducksCommand {
  public id = "trace";
  public description = "Trace structural dependencies (use --flow for data lineage)";
  public usage = "conducks trace <symbol_id> [--flow]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isFlow = args.includes('--flow');
    const symbolInput = args.filter(a => a !== '--flow')[0];

    if (!symbolInput) {
      console.error("Usage: conducks trace <symbol_id> [--flow]");
      return;
    }

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());

    let symbolId = symbolInput;
    if (!registry.query.graph.getGraph().getNode(symbolInput)) {
      const results = await registry.query.query(symbolInput, 1);
      if (results.length > 0) {
        symbolId = results[0].id;
      }
    }

    console.log(`\n\x1b[1m--- 🔌 Conducks Structural Trace: ${symbolId} ---\x1b[0m`);

    try {
      const steps = isFlow ? registry.kinetic.flow(symbolId) : registry.kinetic.trace(symbolId);
      steps.slice(0, 15).forEach((id: string, i: number) => {
        const n = registry.query.graph.getGraph().getNode(id);
        const prefix = (i + 1).toString().padStart(2, '0');
        console.log(`${prefix}. [\x1b[35m${n?.label || 'unknown'}\x1b[0m] ${n?.properties.name || 'unknown'} (\x1b[2m${n?.properties.filePath || 'unknown'}\x1b[0m)`);
      });
    } catch (err) {
      console.error(`Trace Error: ${(err as Error).message}`);
    }
  }
}
