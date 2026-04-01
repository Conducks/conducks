import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Analyze Command
 * 
 * Performs a high-fidelity structural analysis and synchronization pulse.
 */
export class AnalyzeCommand implements ConducksCommand {
  public id = "analyze";
  public description = "Index and analyze repository structure";
  public usage = "conducks analyze [--staged] [--verbose]";

  public async execute(args: string[], injectedPersistence: SynapsePersistence): Promise<void> {
    const isVerbose = args.includes('--verbose');
    const isStaged = args.includes('--staged');
    
    try {
      // Delegate to the unified Analysis domain via the Registry bridge
      await (registry.analyze as any).full({ staged: isStaged, verbose: isVerbose });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed
      await injectedPersistence.close();
    }
  }
}
