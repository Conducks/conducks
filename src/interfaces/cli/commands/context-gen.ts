import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Conducks — Neural Context Generator Command 🧠
 */
export class ContextGenCommand implements ConducksCommand {
  public id = "context-gen";
  public description = "Generate LLM-optimized ARCHITECTURE.md";
  public usage = "registry context-gen";

  public async execute(_args: string[], persistence: DuckDbPersistence): Promise<void> {
    try {
      console.log("[Conducks] Generating Neural Architecture Context...");
      await persistence.load(registry.intelligence.graph.getGraph());
      
      const contextMd = await (registry.governance as any).contextFile();
      const outputPath = path.join(process.cwd(), 'ARCHITECTURE.md');
      
      await fs.writeFile(outputPath, contextMd, 'utf-8');
      
      console.log(`✅ Neural Context generated at: ${outputPath}`);
      console.log(`🚀 This file is optimized for LLM context windows (max 4000 tokens).`);
    } finally {
      await persistence.close();
    }
  }
}
