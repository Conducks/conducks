import * as Parser from "web-tree-sitter";
import chokidar, { FSWatcher } from "chokidar";
import fs from "node:fs/promises";
import { ConducksGraph } from "../../product/indexing/graph-engine.js";
import { GlobalSymbolLinker } from "../graph/linker.js";
import { SynapsePersistence } from "../graph/persistence.js";
import { globalMirror } from "../../product/discovery/mirror-server.js";

interface WatcherOptions {
  ignored?: string[];
  persistence?: SynapsePersistence;
  watcher?: FSWatcher;
}

/**
 * Conducks — Synapse Structural Monitor (Watcher)
 * 
 * Watches the proprietary filesystem for structural changes 
 * and performs real-time incremental pulses to keep the 
 * Synapse Graph in sync.
 */
export class ConducksWatcher {
  private watcher: FSWatcher | null = null;
  private linker = new GlobalSymbolLinker();
  private isInitialized = false;

  constructor(
    private rootDir: string,
    private graph: ConducksGraph,
    private options: WatcherOptions = {}
  ) {
    this.watcher = this.options.watcher || chokidar.watch(this.rootDir, {
      ignored: this.options.ignored || [/(^|[\/\\])\../, "node_modules", "dist", "build"],
      persistent: true,
      ignoreInitial: true,
    });
  }

  /**
   * Starts the Synapse Monitor.
   */
  public start(): void {
    console.error(`[Conducks Synapse Monitor] Monitoring: ${this.rootDir}`);

    if (this.watcher) {
      this.watcher
        .on("add", (path: string) => this.handlePulseEvent("add", path))
        .on("change", (path: string) => this.handlePulseEvent("change", path))
        .on("unlink", (path: string) => this.handlePulseEvent("unlink", path));
    }
  }

  /**
   * Initializes the proprietary beam engine.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await (Parser as any).init();
    this.isInitialized = true;
    console.error("[Conducks Synapse Monitor] Core Beam Engine initialized.");
  }

  /**
   * Stops the Monitor.
   */
  public async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Performs an incremental Synapse Pulse for a single file event.
   */
  private async handlePulseEvent(event: "add" | "change" | "unlink", filePath: string): Promise<void> {
    console.error(`[Conducks Synapse Monitor] Event [${event}]: ${filePath}`);
    
    if (event === "unlink") {
      // Logic to prune stale synapse nodes would go here
      return;
    }

    try {
      const source = await fs.readFile(filePath, "utf-8");
      
      // 1. Partial Structural Reflection
      await this.graph.pulseStructuralStream([{ path: filePath, source }]);

      // 2. Global Synapse Re-Linking
      this.linker.link(this.graph.getGraph());

      // 3. Structural Persistence Update
      if (this.options.persistence) {
        await this.options.persistence.save(this.graph.getGraph());
      }

      // 4. Notify Mirror Dashboard
      if (globalMirror) {
        globalMirror.broadcastPulse({ event, filePath });
      }

      console.error(`[Conducks Synapse Monitor] Synapse updated for: ${filePath}`);
    } catch (err) {
      console.error(`[Conducks Synapse Monitor] Pulse failure in ${filePath}:`, err);
    }
  }
}
