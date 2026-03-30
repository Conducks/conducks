import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { ChronicleInterface } from "@/lib/core/git/chronicle-interface.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * Conducks — Analyze Command
 * 
 * Pulses the structural stream of the repository.
 */
export class AnalyzeCommand implements ConducksCommand {
  public id = "analyze";
  public description = "Index and pulse a repository structure";
  public usage = "registry analyze [--staged] [--chronicle]";

  public async execute(args: string[], injectedPersistence: SynapsePersistence): Promise<void> {
    const isVerbose = args.includes('--verbose');
    const isStaged = args.includes('--staged');
    
    try {
      await (registry.analysis as any).fullPulse({ staged: isStaged, verbose: isVerbose });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed (registry handle might leave it open)
      await injectedPersistence.close();
    }
  }
}
