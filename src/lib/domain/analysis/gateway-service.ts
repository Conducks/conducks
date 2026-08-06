import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { Logger } from "@/lib/core/utils/logger.js";
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

  constructor(
    private graph: ConducksGraph,
    private persistence: SynapsePersistence,
    private projectRoot: string
  ) {
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
            // [Conducks Consistency Check] v2.5.0
            // [Conducks Consistency Check] v3.1.0 🛡️
            // We increase the window to 1250ms to ensure large multi-stage write transactions 
            // from 'analyze --force' are fully flushed and the file handle is cold.
            setTimeout(async () => {
              try {
                logger.info("🛡️ [Synapse Pulse] Structural resonance captured. Generating visual wave...");
                await this.persistence.load(this.graph.getGraph());
                callback({ type: 'PULSE', timestamp: Date.now() });
              } catch (err) {
                logger.error("Failed to reload graph on vault pulse", err);
              } finally {
                // 🛡️ Lock Release: Crucial for non-blocking analysis cycles
                await this.persistence.close();
              }
            }, 1250);
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
  /**
   * The wave is answered from SQL, not from the in-memory graph (ADR 0042, ADR 0054).
   *
   * The old default called `MirrorEngine.getVisualWave`, which walks a materialised graph — so
   * `conducks mirror` had to load every node and edge to draw a few hundred. It also meant the
   * dashboard served an EMPTY wave whenever nothing had loaded the graph, which is what `mirror`
   * did: it is in STALENESS_BYPASS, so the browser got 0 nodes against a vault holding thousands.
   *
   * The `compact` branch that was supposed to be the SQL path called `getCompactWave` through an
   * `as any`. No such method existed. The cast made it compile, and the catch below turned the
   * runtime failure into `{nodes: [], edges: []}` — so the "fast path" was a silent empty result.
   */
  /** The cap this gateway serves when a request does not name one (`mirror --wave-cap`). */
  private waveCap: number | undefined;
  public setWaveCap(limit: number): void { this.waveCap = limit; }

  public async getWave(layers?: number[], _clusters?: string[], spread?: number, _compact: boolean = false, limit?: number) {
    try {
      // The cap is OVERRIDABLE (todo48#P1). It exists because a force graph of ten thousand nodes is
      // unreadable, not because the rest is uninteresting — measured on a five-service monorepo the
      // default hides about a third of eligible nodes, and with no way to raise it that slice was
      // unreachable through this surface entirely.
      const wave = await this.persistence.getVisualWave(layers, spread ?? 1200, limit ?? this.waveCap);
      if (wave.truncated) {
        logger.info(`🛡️ [Mirror] Showing ${wave.nodes.length} of ${wave.totalNodes} nodes — the heaviest slice, not the whole graph.`);
      }
      return wave;
    } catch (err) {
      logger.error('Failed to build the visual wave', err);
      // Still an empty result, but no longer a SILENT one — the log above names the cause.
      return { nodes: [], links: [], clusters: [], truncated: false, totalNodes: 0 };
    }
  }

  /**
   * Hydrates a shallow node with deep structural DNA (complexity, entropy, resonance).
   */
  public async hydrateNode(nodeId: string) {
    try {
      const deep = await this.persistence.fetchNodeDeep(nodeId);
      if (!deep) return null;
      
      // Merge with any in-memory properties if needed
      const node = this.graph.getGraph().getNode(nodeId);
      return {
        ...(node?.properties || {}),
        ...deep,
        isShallow: false
      };
    } finally {
      // 🛡️ Lock Release
      await this.persistence.close();
    }
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
