import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Conducks — Neural Context Generator Command 🧠
 */
export class ContextGenCommand implements ConducksCommand {
  public id = "context-gen";
  public description = "Generate LLM-optimized ARCHITECTURE.md";
  public usage = "registry context-gen";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    try {
      console.log("[Conducks] Generating Neural Architecture Context...");
      // Structural Sync via Registry Bridge
      await registry.infrastructure.persistence.load(registry.query.graph.getGraph());
      
      const contextMd = await (registry.audit as any).contextFile();
      const outputPath = path.join(process.cwd(), 'ARCHITECTURE.md');
      
      await fs.writeFile(outputPath, contextMd, 'utf-8');
      
      console.log(`✅ Neural Context generated at: ${outputPath}`);
      console.log(`🚀 This file is optimized for LLM context windows (max 4000 tokens).`);
    } finally {
      await registry.infrastructure.persistence.close();
    }
  }
}
