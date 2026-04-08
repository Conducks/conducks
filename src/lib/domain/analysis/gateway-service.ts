import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { MirrorEngine } from "@/lib/domain/visual/mirror.engine.js";
import { Logger } from "@/lib/core/utils/logger.js";
import { registry } from "@/registry/index.js";
import fs from "node:fs";
import path from "node:path";

const logger = new Logger("GatewayService");

/**
 * Conducks — Unified Synapse Gateway
 * 
 * High-performance access layer for the Mirror visual dashboard.
 */
export class GatewayService {
  private watcher: fs.FSWatcher | null = null;
  private mirrorEngine: MirrorEngine;

  constructor(
    private graph: ConducksGraph,
    private persistence: SynapsePersistence,
    private projectRoot: string
  ) {
    this.mirrorEngine = new MirrorEngine(this.graph.getGraph());
  }

  /**
   * Starts watching the structural synapse (DuckDB vault) for changes.
   * When a change is detected, it triggers a PULSE to all connected mirrors.
   */
  public watchSynapse(callback: (data: any) => void) {
    const dbPath = path.join(this.projectRoot, '.conducks', 'conducks-synapse.db');
    
    if (this.watcher) this.watcher.close();

    try {
      if (fs.existsSync(dbPath)) {
        // [Conducks Consistency Check] 🛡️
        console.error("🛡️ [Conducks Graph] Re-initializing structural synapse...");
        logger.info(`🛡️ [Synapse Watcher] Monitoring vault for structural heartbeats: ${dbPath}`);
        this.watcher = fs.watch(dbPath, (eventType) => {
          if (eventType === 'change') {
            logger.info("🛡️ [Synapse Watcher] Vault heartbeat detected. Re-resonating graph...");
            // We delay slightly to allow DuckDB to release any write locks
            setTimeout(async () => {
              try {
                await this.persistence.load(this.graph.getGraph());
                callback({ type: 'PULSE', timestamp: Date.now() });
              } catch (err) {
                logger.error("Failed to reload graph on vault change", err);
              }
            }, 500);
          }
        });
      }
    } catch (err) {
      logger.warn("Could not start vault watcher. Live-sync disabled.", err);
    }
  }

  /**
   * Generates a high-fidelity visual wave for the dashboard.
   */
  public getWave(layers?: number[], clusters?: string[], spread?: number) {
    return this.mirrorEngine.getVisualWave(layers, clusters, spread);
  }

  /**
   * Hydrates a shallow node with deep metadata (complexity, entropy, resonance).
   */
  public async hydrateNode(nodeId: string) {
    const meat = await this.persistence.fetchNodeMeat(nodeId);
    if (!meat) return null;
    
    // Merge with any in-memory properties if needed
    const node = this.graph.getGraph().getNode(nodeId);
    return {
      ...(node?.properties || {}),
      ...meat,
      isShallow: false
    };
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
