import Parser from "tree-sitter";
import chokidar, { FSWatcher } from "chokidar";
import fs from "fs-extra";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { GlobalSymbolLinker } from "@/lib/core/graph/linker.js";
import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import { globalMirror } from "@/interfaces/web/mirror-server.js";
import path from "node:path";
import { execSync } from "node:child_process";
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";

/**
 * FIX 3: Remove the `registry` import entirely.
 *
 * The original file imported `registry` from `@/registry/index.js`. Since
 * `registry/index.ts` itself imports `ConducksWatcher`, this creates a
 * circular ESM dependency. In Node's ESM loader, circular imports are
 * partially resolved — the `registry` binding arrives as `undefined` during
 * the initial evaluation of this module. That causes a silent crash the moment
 * the CLI tries to call `registry.initialize()`.
 *
 * The fix: the watcher no longer reaches back into the registry. Instead, it
 * receives every external dependency it needs (graph, persistence) as
 * constructor arguments injected by the command layer (watch.ts). This is
 * standard dependency injection and cleanly breaks the cycle.
 */

interface WatcherOptions {
  ignored?: string[];
  persistence?: DuckDbPersistence;
  watcher?: FSWatcher;
}

import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Synapse Structural Monitor (Watcher)
 */
export class ConducksWatcher implements ConducksComponent {
  public readonly id = 'structural-watcher';
  public readonly type = 'analyzer';
  public readonly description = 'Monitors the file system for structural changes and performs real-time incremental pulses.';
  private watcher: FSWatcher | null = null;
  private linker = new GlobalSymbolLinker();
  private impactAnalyzer = new BlastRadiusAnalyzer();
  private ignoreManager: IgnoreManager;
  private isInitialized = false;

  constructor(
    private rootDir: string,
    private graph: ConducksGraph,
    private options: WatcherOptions = {}
  ) { 
    this.ignoreManager = new IgnoreManager(this.rootDir);
  }

  /**
   * Starts the Synapse Monitor.
   */
  public start(): void {
    if (this.watcher) return;

    if (!this.rootDir || this.rootDir === "/" || this.rootDir === "C:\\") {
      return;
    }

    this.watcher = this.options.watcher || chokidar.watch(this.rootDir, {
      ignored: (p) => this.ignoreManager.isIgnored(p),
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on("add", (filePath: string) => { console.error(`[Watcher Debug] add: ${filePath}`); this.handlePulseEvent("add", filePath); })
      .on("change", (filePath: string) => { console.error(`[Watcher Debug] change: ${filePath}`); this.handlePulseEvent("change", filePath); })
      .on("unlink", (filePath: string) => { console.error(`[Watcher Debug] unlink: ${filePath}`); this.handlePulseEvent("unlink", filePath); });
  }

  /**
   * Initializes the proprietary beam engine.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    const ParserClass = (Parser as any).default || (Parser as any).Parser || Parser;
    if (typeof ParserClass.init === 'function') {
      await ParserClass.init();
    }
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
    if (!filePath || event === "unlink") {
      // Logic to prune stale synapse nodes would go here
      return;
    }

    try {
      const source = await fs.readFile(filePath, "utf-8");

      // 1. Kinetic Diff Extraction (Phase 5.7)
      let changedLines: number[] = [];
      try {
        const diff = execSync(`git diff HEAD "${filePath}"`, { cwd: this.rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const hunks = diff.split('\n').filter(line => line.startsWith('@@'));
        for (const hunk of hunks) {
          const match = hunk.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
          if (match) {
            const start = parseInt(match[1], 10);
            const count = match[2] ? parseInt(match[2], 10) : 1;
            for (let i = 0; i < count; i++) changedLines.push(start + i);
          }
        }
      } catch (e: any) {
        // Universal Fallback: If not a git repo or diff fails, assume all lines changed
        // This ensures the structural resonance is still mapped for the modified units.
        const lineCount = source.split('\n').length;
        for (let i = 1; i <= lineCount; i++) changedLines.push(i);
        console.error(`[Watcher Debug] Git diff unavailable. Falling back to full-resonance for: ${path.basename(filePath)}`);
      }

      // 2. Partial Structural Reflection
      // Conducks: Resolved Canonical Identity (v1.6.5)
      if (!filePath) return;
      const normalizedPath = path.resolve(filePath);
      await this.graph.pulseStructuralStream([{ path: normalizedPath, source }]);

      // 3. Global Synapse Re-Linking
      this.linker.link(this.graph.getGraph());

      // 4. Kinetic Resonance Mapping
      if (changedLines.length > 0) {
        const affectedSymbols = new Set<string>();
        const g = this.graph.getGraph();
        for (const line of changedLines) {
          const symbol = (g as any).findSymbolAtLine(normalizedPath, line as number);
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
              const rows: any[] = await new Promise((res) => db.all("SELECT risk, complexity FROM nodes WHERE id = ? ORDER BY pulseId DESC LIMIT 1 OFFSET 1", symbolId, (err: any, rows: any[]) => res(rows || [])));
              const prevNode = rows[0];
              if (prevNode) riskDelta = (node.properties.risk || 0) - prevNode.risk;
            }

            console.error(`\x1b[35m⚡ Change detected: \x1b[0m${path.relative(this.rootDir, filePath)}`);
            console.error(`   \x1b[1mModified symbol: \x1b[0m${node.properties.name}`);
            console.error(`   \x1b[1mBlast radius:    \x1b[0m${impact.affectedCount} symbols affected`);
            console.error(`   \x1b[1mRisk delta:      \x1b[0m${riskDelta > 0 ? '+' : ''}${riskDelta.toFixed(4)}`);
            if (downstreamNames.length > 0) {
              console.error(`   \x1b[1mDownstream:      \x1b[0m[${downstreamNames.join(', ')}${upstreamIds.length > 5 ? '...' : ''}]`);
            }
            console.error("");
          }
        }
      }

      // 5. Structural Persistence Update (Only if Writer)
      if (this.options.persistence && !(this.options.persistence as any).readOnly) {
        await this.options.persistence.save(this.graph.getGraph());
      }

      // 6. Notify Mirror Dashboard
      if (globalMirror) {
        globalMirror.broadcastPulse({ event, filePath });
      }
    } catch (err: any) {
      console.error(`[Watcher] Pulse error for ${path.basename(filePath)}: ${err?.message || err}`);
    }
  }
}