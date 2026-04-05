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
    
    // Support positional path: conducks analyze <path>
    const targetPath = args.find(a => !a.startsWith('-')) || process.cwd();
    
    try {
      // Delegate to the unified Analysis domain with scoped root
      await (registry.analyze as any).full({ 
        root: targetPath,
        staged: isStaged, 
        verbose: isVerbose 
      });
    } catch (err: any) {
      if (err.message?.includes("LOCKED")) {
        console.error("\n❌ [Conducks] Structural Synapse is LOCKED.");
        console.error("This usually happens if another Conducks process is running or a previous run crashed.");
        console.error("Please ensure no other 'analyze' or 'mirror' pulses are active.\n");
        process.exit(1);
      }
      throw err;
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed
      await registry.infrastructure.persistence.close();
    }
  }
}
