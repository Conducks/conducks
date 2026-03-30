import { Tool } from "../../core/registry/tool-registry.js";
import { DynamicToolLoader } from "../../core/registry/dynamic-loader.js";
import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — HyperToon Registry
 * 
 * The ultimate 'Apostle v6' tool registry. It dynamically binds 
 * structural implementation (TypeScript) with governance 
 * documentation (Markdown) to create high-fidelity MCP tools.
 */
export class HyperToonRegistry {
  private toolsStructureDir: string;
  private loader: DynamicToolLoader;

  constructor() {
    // Apostle v6: Robust Path Discovery
    // Handles both src/ (dev) and build/ (prod) environments.
    // Path: lib/product/mcp/hypertoon.ts -> 3 levels up to find tools-structure
    this.toolsStructureDir = path.resolve(__dirname, "../../../tools-structure");
    
    // Fallback: Check if it exists in the build dir, otherwise use process.cwd()
    if (!fs.existsSync(this.toolsStructureDir)) {
      this.toolsStructureDir = path.resolve(process.cwd(), "tools-structure");
    }

    this.loader = new DynamicToolLoader(this.toolsStructureDir);
  }

  /**
   * Merges static structural tools with dynamic documentation tools.
   * Ensures descriptions are ALWAYS pulled from the documentation if available.
   */
  public async buildApostolicRegistry(staticTools: Tool[]): Promise<Tool[]> {
    const dynamicTools = await this.loader.loadTools();
    const registry: Map<string, Tool> = new Map();

    // 1. Register Dynamic Tools (Documentation-first)
    for (const tool of dynamicTools) {
      registry.set(tool.name, tool);
    }

    // 2. Register Static Tools (Structural Intelligence)
    for (const tool of staticTools) {
      // HyperToon Pattern: Check if an '.md' file exists for this static tool name
      // and override its description with the 'high-fidelity' documentation.
      const mdPath = path.join(this.toolsStructureDir, "tools", `${tool.name}.md`);
      
      if (await fs.pathExists(mdPath)) {
        const content = await fs.readFile(mdPath, "utf8");
        const docDescription = this.extractDescription(content);
        if (docDescription) {
          (tool as any).description = docDescription;
          console.error(`[HyperToon] Syncing high-fidelity description for "${tool.name}" from documentation.`);
        }
      }

      registry.set(tool.name, tool);
    }

    return Array.from(registry.values());
  }

  /**
   * Helper to extract description from <!-- description: ... --> comment.
   */
  private extractDescription(content: string): string | null {
    const match = content.match(/<!--\s*description:\s*(.*?)\s*-->/);
    return match ? match[1] : null;
  }
}
