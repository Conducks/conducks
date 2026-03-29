import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { FederatedLinker } from "../../../lib/core/graph/linker-federated.js";
import { BlueprintGenerator } from "../../../lib/product/discovery/blueprint-generator.js";

/**
 * Conducks — Blueprint Command
 */
export class BlueprintCommand implements ApostleCommand {
  public id = "blueprint";
  public description = "Generate structural manifest (blueprint)";
  public usage = "conducks blueprint";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    console.log("[Conducks] Generating Structural Graph...");
    await persistence.load(conducks.graph.getGraph());
    
    // Hydrate Federated Graphs
    const linker = new FederatedLinker();
    await linker.hydrate(conducks.graph.getGraph());
    
    const generator = new BlueprintGenerator();
    const targetPath = await generator.generate(conducks.graph.getGraph());
    console.log(`✅ Structural Graph generated at: ${targetPath}`);
  }
}
