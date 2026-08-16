import fs from "node:fs/promises";
import path from "node:path";
import { ConducksReflector } from "@/lib/core/parsing/reflector.js";
import { AnalyzeContext } from "../../core/parsing/context.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { SynapsePersistence } from "../../core/persistence/persistence.js";
import { Logger } from "../../core/utils/logger.js";
import { grammars } from "../../core/parsing/grammar-registry.js";
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

      // 5. Conducks Purge & Resurrection 🛡️
      //
      // The success line used to sit OUTSIDE this branch, so a read-only handle — which is every
      // CLI invocation except `analyze` and `clean` (cli/index.ts) — printed "resurrected (N
      // nodes)" and returned success:true having written nothing. `conducks status --mode pulse`
      // reported 19 nodes into a vault it had not touched. Whether the write happened is now the
      // thing that decides what is reported.
      const readOnly = !!(this.persistence as any).readOnly;
      if (!readOnly) {
        const unitId = `${absolutePath.toLowerCase()}::unit`;
        await this.persistence.purgeUnits([unitId]);

        // Flush spectrum nodes to vault directly
        const nodes = spectrum.nodes.map((n: any) => ({
          id: n.metadata?.id || `${absolutePath}::${n.name}`,
          name: n.name,
          label: n.canonicalKind || 'UNIT',
          properties: { ...n.metadata, ...n }
        }));
        await this.persistence.saveNodes(nodes, `micro_${Date.now()}`);
        logger.success(`🛡️ [Micro-Pulse] ${path.basename(absolutePath)} resurrected (${spectrum.nodes.length} nodes).`);
      } else {
        logger.warn(`🛡️ [Micro-Pulse] ${path.basename(absolutePath)} parsed (${spectrum.nodes.length} nodes) but NOT written — the vault is open read-only.`);
      }

      return {
        success: true,
        persisted: !readOnly,
        nodes: spectrum.nodes.length
      };
    } catch (err: any) {
      logger.error(`🛡️ [Micro-Pulse] Failed to resonate ${filePath}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
