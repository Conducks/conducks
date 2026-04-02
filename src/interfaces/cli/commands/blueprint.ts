import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { BlueprintGenerator } from "@/lib/domain/governance/blueprint-generator.js";

/**
 * Conducks — Blueprint Command
 */
export class BlueprintCommand implements ConducksCommand {
  public id = "blueprint";
  public description = "Generate structural manifest (blueprint)";
  public usage = "registry blueprint";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    try {
      console.log("[Conducks] Generating Structural Graph...");
      // Structural Sync via Registry Bridge
      await registry.infrastructure.persistence.load(registry.query.graph.getGraph());
      
      const generator = new BlueprintGenerator();
      const targetPath = await generator.generate(registry.query.graph.getGraph());
      console.log(`✅ Structural Graph generated at: ${targetPath}`);
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await registry.infrastructure.persistence.close();
    }
  }
}
