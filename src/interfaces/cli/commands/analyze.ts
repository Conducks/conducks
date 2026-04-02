import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Analyze Command
 * 
 * Performs a high-fidelity structural analysis and synchronization pulse.
 */
export class AnalyzeCommand implements ConducksCommand {
  public id = "analyze";
  public description = "Index and analyze repository structure";
  public usage = "conducks analyze [--staged] [--verbose]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isVerbose = args.includes('--verbose');
    const isStaged = args.includes('--staged');
    
    try {
      // Delegate to the unified Analysis domain via the Registry bridge
      await (registry.analyze as any).full({ staged: isStaged, verbose: isVerbose });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed
      await registry.infrastructure.persistence.close();
    }
  }
}
