import * as Parser from "web-tree-sitter";
import chokidar, { FSWatcher } from "chokidar";
import fs from "fs-extra";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { GlobalSymbolLinker } from "@/lib/core/graph/linker.js";
import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import { globalMirror } from "@/interfaces/web/mirror-server.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import { execSync } from "node:child_process";
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";

interface WatcherOptions {
  ignored?: string[];
  persistence?: DuckDbPersistence;
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
  private impactAnalyzer = new BlastRadiusAnalyzer();
  private isInitialized = false;

  constructor(
    private rootDir: string,
    private graph: ConducksGraph,
    private options: WatcherOptions = {}
  ) {}

  /**
   * Starts the Synapse Monitor.
   */
  public start(): void {
    if (this.watcher) return;

    if (!this.rootDir || this.rootDir === "/" || this.rootDir === "C:\\") {
      return;
    }

    this.watcher = this.options.watcher || chokidar.watch(this.rootDir, {
      ignored: this.options.ignored || [/(^|[\/\\])\@/, "node_modules", "dist", "build", ".git"],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on("add", (path: string) => this.handlePulseEvent("add", path))
      .on("change", (path: string) => this.handlePulseEvent("change", path))
      .on("unlink", (path: string) => this.handlePulseEvent("unlink", path));
  }

  /**
   * Initializes the proprietary beam engine.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await (Parser as any).init();
    this.isInitialized = true;
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
    if (event === "unlink") {
      // Logic to prune stale synapse nodes would go here
      return;
    }
    
    try {
      const source = await fs.readFile(filePath, "utf-8");
      
      // 1. Kinetic Diff Extraction (Phase 5.7)
      let changedLines: number[] = [];
      try {
        const diff = execSync(`git diff HEAD "${filePath}"`, { cwd: this.rootDir, encoding: 'utf8' });
        const hunks = diff.split('\n').filter(line => line.startsWith('@@'));
        for (const hunk of hunks) {
          const match = hunk.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
          if (match) {
            const start = parseInt(match[1], 10);
            const count = match[2] ? parseInt(match[2], 10) : 1;
            for (let i = 0; i < count; i++) changedLines.push(start + i);
          }
        }
      } catch (e) {
        // Not a git repo or no changes
      }

      // 2. Partial Structural Reflection
      await this.graph.pulseStructuralStream([{ path: filePath, source }]);

      // 3. Global Synapse Re-Linking
      this.linker.link(this.graph.getGraph());

      // 4. Kinetic Resonance Mapping
      if (changedLines.length > 0) {
        const affectedSymbols = new Set<string>();
        const g = this.graph.getGraph();
        for (const line of changedLines) {
          const symbol = (g as any).findSymbolAtLine(filePath, line as number);
          if (symbol) affectedSymbols.add(symbol.id as string);
        }

        if (affectedSymbols.size > 0) {
          for (const symbolId of affectedSymbols) {
            const node = g.getNode(symbolId);
            if (!node) continue;

            const impact = this.impactAnalyzer.analyzeImpact(g, symbolId);
            const upstream = g.traverseUpstream(symbolId);
            const upstreamIds = Array.from(upstream.keys()).filter(id => id !== symbolId);
            const downstreamNames = upstreamIds.slice(0, 5).map(id => id.split('::').pop() || id);

            // Get Baseline Risk from DB for Delta calculation
            const db: any = await (this.options.persistence as any)?.getRawConnection();
            let riskDelta = 0;
            if (db) {
               const prevNode: any = await new Promise((res) => db.get("SELECT risk FROM nodes WHERE id = ? ORDER BY pulseId DESC LIMIT 1 OFFSET 1", symbolId, (err: any, row: any) => res(row)));
               if (prevNode) riskDelta = (node.properties.risk || 0) - prevNode.risk;
            }

            console.log(`\x1b[35m⚡ Change detected: \x1b[0m${path.relative(this.rootDir, filePath)}`);
            console.log(`   \x1b[1mModified symbol: \x1b[0m${node.properties.name}`);
            console.log(`   \x1b[1mBlast radius:    \x1b[0m${impact.affectedCount} symbols affected`);
            console.log(`   \x1b[1mRisk delta:      \x1b[0m${riskDelta > 0 ? '+' : ''}${riskDelta.toFixed(4)}`);
            if (downstreamNames.length > 0) {
              console.log(`   \x1b[1mDownstream:      \x1b[0m[${downstreamNames.join(', ')}${upstreamIds.length > 5 ? '...' : ''}]`);
            }
            console.log(""); 
          }
        }
      }

      // 5. Structural Persistence Update
      if (this.options.persistence) {
        await this.options.persistence.save(this.graph.getGraph());
      }

      // 6. Notify Mirror Dashboard
      if (globalMirror) {
        globalMirror.broadcastPulse({ event, filePath });
      }
    } catch (err) {
      // Fail silent in background watcher
    }
  }
}
