import fs from "node:fs/promises";
import path from "node:path";
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { SynapseRegistry } from "@/lib/core/registry/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { Logger } from "@/lib/core/utils/index.js";
import { grammars } from "@/lib/core/parsing/index.js";
import { chronicle } from "@/lib/core/git/index.js";

const logger = new Logger("MicroPulse");

/**
 * Conducks — Micro-Pulse Service 💎 🔨
 * 
 * High-fidelity incremental induction for the Architectural Mirror.
 * Performs sub-second structural "resurrection" for modified units.
 */
export class MicroPulseService {
  private reflector = new ConducksReflector();

  constructor(
    private registry: SynapseRegistry<any>,
    private persistence: SynapsePersistence
  ) {}

  /**
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
  }

  /**
   * Resonates a single file unit into the Structural Synapse.
   */
  public async resonate(filePath: string): Promise<{ success: boolean; persisted?: boolean; error?: string; nodes?: number }> {
    try {
      const root = chronicle.getProjectDir();
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
      const provider = this.registry.getProvider(absolutePath);
      
      if (!provider) {
        return { success: false, error: `No structural provider found for ${path.extname(absolutePath)}` };
      }

      // 1. Read Source
      const source = await fs.readFile(absolutePath, 'utf8');

      // 2. Prepare Context (Shallow Resolution)
      const context = new AnalyzeContext();
      // In Micro-Pulse mode, we don't have a giant allPaths list, 
      // so we use the file itself or let the reflector handle it.
      const allPaths: string[] = [absolutePath];

      // 3. Ensure Grammar is Warmed Up
      await grammars.loadLanguage(provider.langId);

      // 4. Reflect Structure
      const spectrum = await this.reflector.reflect(
        { path: absolutePath, source },
        provider,
        context,
        allPaths
      );

      // 5. NO WRITE. The micro-pulse parses one file and reports what it found.
      //
      // It had a write branch — purge the unit, then save its nodes — that no caller could reach:
      // `status --mode pulse` and the MCP synapse tool's `pulse` mode both hold a read-only vault, and
      // both say so. It was also wrong if it ever ran: the purge committed on its own, it deleted the
      // unit's outgoing edges and wrote none back, its node ids were not the ids `analyze` writes, and
      // its rows had no `unitId`, so `purgeUnits` could never find them again (state-machine audit
      // round 2, Q-06-1). Writing one file correctly is the watcher's `writeUnit`; this is a probe.
      logger.warn(`🛡️ [Micro-Pulse] ${path.basename(absolutePath)} parsed (${spectrum.nodes.length} nodes); not written — run 'conducks analyze' to persist.`);

      return {
        success: true,
        persisted: false,
        nodes: spectrum.nodes.length
      };
    } catch (err: any) {
      logger.error(`🛡️ [Micro-Pulse] Failed to resonate ${filePath}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
