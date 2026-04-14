import { Tool } from "@/registry/tool-registry.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Tool Registry
 * 
 * Conducks: Strict 8-Tool Enforcement (Rule 6/13)
 * 
 * This registry ONLY augments the descriptions of the 8 static tools
 * with high-fidelity documentation from markdown files. It does NOT create
 * new dynamic tools. All legacy documentation tools have been migrated to
 * the skills/ framework, accessible via `conducks_system(mode: 'skill')`.
 */
export class ConducksRegistry {
  private toolsStructureDir: string;

  constructor() {
    // Conducks: High-Fidelity Resource Discovery
    this.toolsStructureDir = path.resolve(__dirname, "../../resources/tools");

    // Fallback: Check if it exists in the build dir, otherwise use process.cwd()
    if (!fs.existsSync(this.toolsStructureDir)) {
      this.toolsStructureDir = path.resolve(process.cwd(), "src/resources/tools");
    }
  }

  /**
   * Augments static structural tools with documentation-sourced descriptions.
   * 
   * Rule 6/13 ENFORCEMENT: This method returns ONLY the static tools passed in.
   * No dynamic tools are created. Legacy documentation tools (debugging, refactoring,
   * docs, lifecycle, structure, tool-list) are archived and accessible exclusively
   * via the skills/ framework through `conducks_system(mode: 'skill')`.
   */
  public async buildConducksRegistry(staticTools: Tool[]): Promise<Tool[]> {
    // Augment static tool descriptions from documentation (if matching .md files exist)
    for (const tool of staticTools) {
      const mdPath = path.join(this.toolsStructureDir, "tools", `${tool.name}.md`);

      if (await fs.pathExists(mdPath)) {
        const content = await fs.readFile(mdPath, "utf8");
        const docDescription = this.extractDescription(content);
        if (docDescription) {
          (tool as any).description = docDescription;
          console.error(`[Conducks] Syncing high-fidelity description for "${tool.name}" from documentation.`);
        }
      }

      // Conducks Lazy Resonance: Wrap tool handler to ensure database connection yields
      const originalHandler = tool.handler;
      tool.handler = async (args: any) => {
        // Conducks: Dynamic Root Discovery
        // We prioritize the 'path' argument from the tool call, then the environment, then CWD.
        const requestPath = args.path || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        
        try {
          // Conducks High-Fidelity Pivot: Re-anchor the structural synapse to the requested path.
          // The RegistryBootstrapper ensures this is a no-op if we are already anchored correctly.
          await registry.initialize(true, requestPath);
          
          return await originalHandler(args);
        } catch (err: any) {
          console.error(`[Conducks] Tool Handler Error: ${err.message}`);
          throw err;
        } finally {
          // 🛡️ [Vault Hardening] Always close the synapse connection after a tool call.
          // This prevents DB locking when the user tries to run CLI commands concurrently.
          await (registry.infrastructure.persistence as any).close();
        }
      };
    }

    // Rule 6/13: Return ONLY the 8 static tools. No dynamic additions.
    return staticTools;
  }

  /**
   * Helper to extract description from <!-- description: ... --> comment.
   */
  private extractDescription(content: string): string | null {
    const match = content.match(/<!--\s*description:\s*(.*?)\s*-->/);
    return match ? match[1] : null;
  }
}
