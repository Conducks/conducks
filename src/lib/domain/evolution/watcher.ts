import { writeWatcherMarker, clearWatcherMarker, HEARTBEAT_INTERVAL_MS } from "@/lib/domain/evolution/watcher-liveness.js";
import chokidar, { FSWatcher } from "chokidar";
import fs from "fs-extra";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { GlobalSymbolLinker } from "@/lib/core/graph/linker.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import { FileHashGate } from "@/lib/core/persistence/file-hash-gate.js";

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
  persistence?: SynapsePersistence;
  watcher?: FSWatcher;
  /**
   * Optional pulse subscriber (dependency inversion). The watcher (domain) must NOT import the
   * web mirror directly — that inverts the layer contract and creates a domain→web→composition
   * →domain cycle. Instead the web layer, which legally imports domain, sets this callback to
   * forward pulses to the mirror dashboard.
   */
  onPulse?: (pulse: { event: string; filePath: string }) => void;
}


/**
 * Conducks — Synapse Structural Monitor (Watcher)
 */
export class ConducksWatcher {
  private watcher: FSWatcher | null = null;
  private linker = new GlobalSymbolLinker();
  private impactAnalyzer = new BlastRadiusAnalyzer();
  private ignoreManager: IgnoreManager;
  private isInitialized = false;
  private autoPulse = false;
  /** Undefined when no persistence was injected — then every event is treated as a change. */
  private hashGate?: FileHashGate;
  /** Saves dismissed by the hash gate, so `watch` can report what it did not do. */
  private skippedUnchanged = 0;

  constructor(
    private rootDir: string,
    private graph: ConducksGraph,
    private options: WatcherOptions = {}
  ) {
    this.ignoreManager = new IgnoreManager(this.rootDir);
    if (this.options.persistence) this.hashGate = new FileHashGate(this.options.persistence);
  }

  /** How many file events were dismissed as byte-identical since this watcher started. */
  public get unchangedSkips(): number { return this.skippedUnchanged; }

  /**
   * Enables or disables automatic structural pulsing to the database.
   */
  public enableAutoPulse(enabled: boolean): void {
    this.autoPulse = enabled;
  }

  /**
   * Subscribe to pulse events (dependency inversion). Called by the web layer to forward pulses
   * to the mirror dashboard, so the watcher (domain) never imports web. Breaks the old
   * domain→web→composition→domain cycle.
   */
  public setPulseSubscriber(onPulse: (pulse: { event: string; filePath: string }) => void): void {
    this.options.onPulse = onPulse;
  }

  /**
   * Replaces the ignore manager used to filter watched file events.
   * Must be called before start() for the new patterns to take effect,
   * since chokidar captures the ignored predicate at watch-time.
   */
  public setIgnoreManager(ignoreManager: IgnoreManager): void {
    this.ignoreManager = ignoreManager;
  }

  /**
   * Starts the Synapse Monitor.
   */
  /** Refreshes the liveness marker while this watcher runs. Null when stopped. */
  private heartbeat: ReturnType<typeof setInterval> | null = null;

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
      .on("unlink", (filePath: string) => { console.error(`[Watcher Debug] unlink: ${filePath}`); this.handlePulseEvent("unlink", filePath); })
      .on("error", (err: unknown) => { console.error('[Watcher]', err); });

    // Publish liveness so a DEAD watcher stops looking like no watcher (todo21#P3). Both render as
    // drift in `monitor`, and they mean opposite things: nobody watching is a choice, a watcher that
    // fell over is an incident.
    const startedAt = new Date().toISOString();
    writeWatcherMarker(this.rootDir, startedAt, new Date());
    this.heartbeat = setInterval(
      () => { try { writeWatcherMarker(this.rootDir, startedAt, new Date()); } catch { /* a diagnostic must not kill the watcher */ } },
      HEARTBEAT_INTERVAL_MS,
    );
    // Never hold the event loop open for a heartbeat — the watcher's own handles decide the
    // process lifetime, and an unreffed timer means `stop()` is the only thing that ends it.
    this.heartbeat.unref?.();
  }

  /**
   * Initializes the proprietary beam engine.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    // No parser bootstrap needed: the native binding has no static init() — that was the
    // web-tree-sitter (WASM) API, and grammars are induced lazily by GrammarRegistry.
    this.isInitialized = true;
  }

  /**
   * Stops the Monitor.
   */
  public async stop(): Promise<void> {
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    // Removed on a CLEAN stop, so a deliberate shutdown reads as "none" rather than "dead".
    clearWatcherMarker(this.rootDir);
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
      if (filePath && event === "unlink") await this.hashGate?.forget(path.resolve(filePath));
      return;
    }

    try {
      const source = await fs.readFile(filePath, "utf-8");

      // 0. The hash gate (todo17 Phase 1). An autosave, a formatter run on focus loss and a branch
      // switch all fire change events carrying content the graph already holds; everything below —
      // a git subprocess, a grammar load, a parse, a global re-link — costs the same for those as for
      // a real edit. One string comparison in front of it dismisses them. A miss falls through to the
      // work, so this can only cost time, never correctness.
      if (this.hashGate && !(await this.hashGate.hasChanged(path.resolve(filePath), source))) {
        this.skippedUnchanged++;
        console.error(`[Watcher] unchanged, skipped: ${path.basename(filePath)}`);
        return;
      }

      // 1. Kinetic Diff Extraction (Phase 5.7)
      let changedLines: number[] = [];
      try {
        const { stdout: diff } = await execFileAsync('git', ['diff', 'HEAD', '--', filePath], { cwd: this.rootDir, encoding: 'utf8' });
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
            let riskDelta = 0;
            try {
              const persistence: any = this.options.persistence;
              if (persistence?.query) {
                const rows: any[] = await persistence.query(
                  "SELECT risk, complexity FROM nodes WHERE id = ? ORDER BY pulseId DESC LIMIT 1 OFFSET 1",
                  [symbolId]
                );
                if (rows[0]) riskDelta = (node.properties.risk || 0) - rows[0].risk;
              }
            } catch { /* baseline risk is supplementary — non-fatal */ }

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

      // 5. Structural Persistence Update (Only if Writer or Auto-Pulse)
      if (this.autoPulse && this.options.persistence && !(this.options.persistence as any).readOnly) {
        console.error(`🛡️ [Conducks Watcher] Auto-Pulse: Persisting structural delta to vault...`);
        await this.options.persistence.save(this.graph.getGraph());
      } else if (this.options.persistence && !(this.options.persistence as any).readOnly) {
        await this.options.persistence.save(this.graph.getGraph());
      }

      // 6. Record the hash — AFTER the pulse and the save, never before. Recording first would make a
      // parse that threw look complete, and those nodes would stay missing until the file changed again.
      await this.hashGate?.record(path.resolve(filePath), source);

      // 7. Notify pulse subscriber (web mirror wires this in — dependency inversion, no domain→web import)
      this.options.onPulse?.({ event, filePath });
    } catch (err: any) {
      console.error(`[Watcher] Pulse error for ${path.basename(filePath)}: ${err?.message || err}`);
    }
  }
}