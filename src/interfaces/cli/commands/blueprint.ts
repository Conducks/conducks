import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import { BlueprintGenerator } from "@/lib/domain/governance/blueprint-generator.js";

/**
 * Conducks — Blueprint Command
 */
export class BlueprintCommand implements ConducksCommand {
  public id = "blueprint";
  public description = "Generate structural manifest (blueprint)";
  public usage = "registry blueprint";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    try {
      console.log("[Conducks] Generating Structural Graph...");
      await persistence.load(registry.intelligence.graph.getGraph());
      
      // Hydrate Federated Graphs
      const linker = new FederatedLinker();
      await linker.hydrate(registry.intelligence.graph.getGraph());
      
      const generator = new BlueprintGenerator();
      const targetPath = await generator.generate(registry.intelligence.graph.getGraph());
      console.log(`✅ Structural Graph generated at: ${targetPath}`);
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await persistence.close();
    }
  }
}
