import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import { syncGraph, closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Neural Context Generator Command 🧠
 */
export class ContextGenCommand implements ConducksCommand {
  public id = "context-gen";
  public description = "Generate LLM-optimized ARCHITECTURE.md (DERIVED — conducks-docs standard)";
  public usage = "conducks context-gen [--out <path>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    try {
      console.log("[Conducks] Generating Neural Architecture Context...");
      await syncGraph(registry);

      const contextMd = await (registry.audit as any).contextFile();

      // --out routes the DERIVED architecture doc into the conducks-docs standard location
      // (docs/architecture.md). Default stays root ARCHITECTURE.md for back-compat.
      const outIdx = args.indexOf("--out");
      const rel = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : "ARCHITECTURE.md";
      const outputPath = rel.startsWith("/") ? rel : path.join(process.cwd(), rel);

      await fs.writeFile(outputPath, contextMd, "utf-8");

      console.log(`✅ Neural Context generated at: ${outputPath}`);
      console.log(`🚀 This file is optimized for LLM context windows (max 4000 tokens).`);
    } finally {
      await closePersistence(registry);
    }
  }
}
