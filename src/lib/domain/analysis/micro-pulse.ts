import fs from "node:fs/promises";
import path from "node:path";
import { ConducksReflector } from "./reflector.js";
import { AnalyzeContext } from "../../core/parsing/context.js";
import { SynapseRegistry } from "../../../registry/synapse-registry.js";
import { SynapsePersistence } from "../../core/persistence/persistence.js";
import { Logger } from "../../core/utils/logger.js";
import { grammars } from "../../core/parsing/grammar-registry.js";

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
   * Apostolic Re-Anchoring 🏺
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
  }

  /**
   * Resonates a single file unit into the Structural Synapse.
   * Purges the stale version and resurrects the new structural DNA.
   */
  public async resonate(filePath: string): Promise<{ success: boolean; error?: string; nodes?: number }> {
    try {
      const absolutePath = path.resolve(filePath);
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

      // 5. Apostolic Purge & Resurrection 🏺
      // We explicitly purge the unit and its stale relationships.
      const unitId = `${absolutePath.toLowerCase()}::unit`;
      
      // Use the existing SynapsePersistence hardening
      await this.persistence.purgeUnits([unitId]);
      
      // Save the fresh spectrum
      await this.persistence.saveBatchSpectrum([{
        filePath: absolutePath,
        spectrum
      }], `micro_${Date.now()}`);

      logger.success(`🛡️ [Micro-Pulse] ${path.basename(absolutePath)} resurrected (${spectrum.nodes.length} nodes).`);
      
      return { 
        success: true, 
        nodes: spectrum.nodes.length 
      };
    } catch (err: any) {
      logger.error(`🛡️ [Micro-Pulse] Failed to resonate ${filePath}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
