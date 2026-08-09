import { Tool } from "@/registry/tool-registry.js";
import { registry } from "@/registry/index.js";
import { acquireAnchor, releaseAnchor } from "@/interfaces/tools/shared/anchor.js";
import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";


/** Serialises tool calls — see the queue comment in the handler wrapper below. */
let queue: Promise<void> = Promise.resolve();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Tool Registry
 * 
 * This registry ONLY augments the descriptions of the static tools it is handed —
 * it never creates, adds, or removes a tool. The surface is defined by what server.ts
 * registers; the count is derived there, never restated (CONDUCKS-9).
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
   * This method returns ONLY the static tools passed in.
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
        
        // CONCURRENT. Tool calls overlap again; ADR 0146's queue is gone (todo52).
        //
        // Everything below is still a module-level SINGLETON — one registry, one materialised graph,
        // one vault handle — and ADR 0146 serialised every call because two races were live. Both are
        // now closed at their source, and each is mutation-verified against
        // `mcp-concurrency.test.ts`:
        //
        //   WRONG ANSWER — `SYMBOL_NOT_FOUND` for a symbol that exists. `initialize()` cleared
        //   `pendingLoad` at the TOP of every call, so a call that changed nothing clobbered an armed
        //   deferred load; the graph stayed deferred and tools walked an empty one. It is now cleared
        //   only when actually re-anchoring. Putting it back reproduces the failure.
        //
        //   CLOSED HANDLE — `Database was already closed`. `tool-registry`'s `finally` closed the
        //   shared vault outright, ignoring the ref-count, so with two calls in flight whichever
        //   finished first hung up on the other. The count now lives on the registry that owns the
        //   handle (`acquireVault`/`releaseVault`) and every closer goes through it. Restoring the
        //   unconditional close reproduces the failure.
        //
        // The handle swap ADR 0146 blamed was real but self-inflicted — `releaseAnchor()` closes the
        // vault and the bootstrapper treated a disconnected handle as a reason to build a new one, so
        // every call swapped in the steady state. Fixing that is what bought the speed: ADR 0128's
        // probe went from 2,135 ms serialised to ~500 ms.
        acquireAnchor();
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
          await releaseAnchor();
        }
      };
    }

    // Return ONLY the static tools passed in. No dynamic additions.
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
