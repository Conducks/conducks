import { SOURCE_EXTENSIONS } from "@/contracts/index.js";
import { logger } from "@/lib/core/utils/index.js";
import { classifyFreshness } from "@/lib/core/persistence/index.js";
import { writeWatcherMarker, clearWatcherMarker, HEARTBEAT_INTERVAL_MS } from "@/lib/domain/evolution/watcher-liveness.js";
import chokidar, { FSWatcher } from "chokidar";
import fs from "fs-extra";
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { GlobalSymbolLinker } from "@/lib/core/graph/index.js";
import { IntraLinker } from "@/lib/core/graph/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";
import { IgnoreManager, TypeScriptResolver } from "@/lib/core/parsing/index.js";
import { FileHashGate } from "@/lib/core/persistence/index.js";

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
/** Extensions the startup reconcile considers — the one shared list (contracts/source-extensions.ts). */
const WATCHED_EXTENSIONS = SOURCE_EXTENSIONS;

export class ConducksWatcher {
  private watcher: FSWatcher | null = null;
  private linker = new GlobalSymbolLinker();
  // Same wiring as the analyze path: the port is graph's, the implementation is parsing's, and
  // domain is the layer allowed to know both (ADR 0005).
  private tsResolver = new TypeScriptResolver();
  private intraLinker = new IntraLinker((spec, from, all) => this.tsResolver.resolve(spec, from, all));
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
  private readyPromise?: Promise<void>;
  private resolveReady?: () => void;
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

    // READY is a real signal and must be awaited before anyone claims the watcher is live.
    //
    // `start()` returns as soon as chokidar is constructed, and the CLI then printed "Live Mirror Mode
    // active" — but with `usePolling` the poller has not yet taken its baseline snapshot. A file
    // created in that gap is recorded as part of the initial state (`ignoreInitial: true`) and NEVER
    // reported: the startup reconcile has already run, so nothing catches it either. Measured as a
    // ~1-in-3 miss in `blocking-commands.test.ts`, which writes the moment the banner appears; a
    // one-second settle made it 5-for-5, which is what pinned the window rather than the mechanism
    // (todo55).
    this.readyPromise = new Promise<void>(resolve => { this.resolveReady = resolve; });
    this.watcher.on("ready", () => { this.resolveReady?.(); });

    this.watcher
      .on("add", (filePath: string) => { logger.debug(`watch add: ${filePath}`); this.handlePulseEvent("add", filePath); })
      .on("change", (filePath: string) => { logger.debug(`watch change: ${filePath}`); this.handlePulseEvent("change", filePath); })
      .on("unlink", (filePath: string) => { logger.debug(`watch unlink: ${filePath}`); this.handlePulseEvent("unlink", filePath); })
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
  /**
   * Resolves when the file watcher has established its baseline and is genuinely watching.
   *
   * Callers must await this before announcing the watcher is live, and before running the startup
   * reconcile — a reconcile that finishes BEFORE the baseline leaves a window in which a new file is
   * neither reported as an event nor caught by the sweep (todo55).
   */
  public whenReady(): Promise<void> {
    return this.readyPromise ?? Promise.resolve();
  }

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

    // Reclaim the churn this session created, ON SHUTDOWN and nowhere else (todo21#P1).
    //
    // DuckDB never reclaims deleted row versions (ADR 0037), and every micro-pulse purges a unit's
    // rows and re-inserts them. Only `analyze` called `reclaimIfBloated`, so a long watcher session
    // grew the vault with nothing ever reclaiming it — verified by grep before this line existed.
    //
    // On SHUTDOWN rather than per pulse, deliberately: the check is one cheap query, but when it
    // fires it rewrites the whole file, and a multi-second pause in the middle of a save-loop is
    // exactly the "accelerator that became a requirement" ADR 0036 warns about. At shutdown nobody
    // is waiting. The ratio gate means a healthy vault pays a single query and nothing else.
    //
    // Never throws: a failed cleanup must not fail a shutdown, and the worst case is the churn
    // surviving until the next `analyze`, which is where it lived before this.
    try { await this.options.persistence?.reclaimIfBloated(3); } catch { /* churn waits for analyze */ }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Performs an incremental Synapse Pulse for a single file event.
   */
  /**
   * Catch up on everything that changed while this watcher was NOT running (ADR 0036, todo21#P3).
   *
   * chokidar starts with `ignoreInitial: true`, so without this the watcher sees events from the
   * moment it starts and NOTHING before — every edit made while it was off stayed invisible until
   * the next full `analyze`. The monitor could already compute exactly that set and the watcher had
   * no way to ask for it, which is the duplication ADR 0036 wanted collapsed. Both now read the same
   * engine.
   *
   * Reconciles CHANGED and ADDED, and deliberately not REMOVED: a deletion needs `purgeUnits`, which
   * the event path already handles, and the next `analyze`'s reconcile scan catches anything missed
   * while nothing was watching (ADR 0078). Doing it here would duplicate that with no new coverage.
   *
   * Never throws. A watcher that cannot catch up must still watch — starting blind is strictly
   * better than not starting.
   */
  /** Every file the graph currently holds a UNIT node for — the same key `dead-code` reads. */
  private knownUnitPaths(): string[] {
    const paths = new Set<string>();
    for (const node of this.graph.getGraph().getAllNodes()) {
      if (String((node.properties as any)?.canonicalKind ?? '') !== 'UNIT') continue;
      const file = String((node.properties as any)?.filePath ?? '');
      if (file) paths.add(file);
    }
    return [...paths];
  }

  public async reconcileOnStart(onDisk: readonly string[]): Promise<{ changed: number; added: number }> {
    const persistence = this.options.persistence;
    if (!persistence) return { changed: 0, added: 0 };
    try {
      const stored = await persistence.getAllFileHashes();
      const fresh = classifyFreshness(
        stored, onDisk, WATCHED_EXTENSIONS,
        abs => { try { return fs.readFileSync(abs, 'utf8'); } catch { return null; } },
        abs => fs.existsSync(abs),
        p => path.extname(p),
      );
      const toPulse = [...fresh.added, ...fresh.changed].filter(f => !this.ignoreManager.isIgnored(f));
      for (const filePath of toPulse) await this.handlePulseEvent('change', filePath);
      return { changed: fresh.changed.length, added: fresh.added.length };
    } catch {
      return { changed: 0, added: 0 };
    }
  }

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
        logger.debug(`Git diff unavailable; full resonance for ${path.basename(filePath)}`);
      }

      // A NEW file — created after `watch` started — is UNTRACKED, and `git diff HEAD -- <file>`
      // prints nothing for an untracked path and exits 0, so the parse above produced no hunks and
      // threw nothing: `changedLines` is empty. The hash gate already proved the content differs from
      // what the graph holds, so an empty diff here means git could not attribute the change (untracked
      // file, or content reverted to HEAD while the graph is stale), NOT that nothing changed. Map the
      // whole file, exactly as the catch fallback does — otherwise the `⚡ Change detected` block below
      // is skipped and a brand-new file pulses into the graph with no output at all (todo51).
      if (changedLines.length === 0) {
        const lineCount = source.split('\n').length;
        for (let i = 1; i <= lineCount; i++) changedLines.push(i);
      }

      // 2. Partial Structural Reflection
      // Conducks: Resolved Canonical Identity (v1.6.5)
      if (!filePath) return;
      const normalizedPath = path.resolve(filePath);
      // THE FILES THE GRAPH ALREADY KNOWS ARE THE RESOLUTION UNIVERSE. An import is resolved against
      // a list of candidate paths, and re-pulsing one file in isolation gives the resolver nothing
      // to match — every specifier dangles and the file's edges are lost on every save.
      //
      // Read from the graph's own UNIT nodes rather than walking the disk: the walk is what
      // `analyze` and the startup reconcile do once, and repeating it per keystroke would put a
      // filesystem traversal on the edit path. The changed file is added because a file created
      // while the watcher runs has no unit node yet.
      await this.graph.pulseStructuralStream(
        [{ path: normalizedPath, source }],
        [...this.knownUnitPaths(), normalizedPath],
      );

      // 3. Global Synapse Re-Linking
      this.linker.link(this.graph.getGraph());

      // 3b. INTRA-PROJECT RESOLUTION, which `analyze` runs and this path did not.
      //
      // A re-parse emits its call targets as bare names; the intra-linker is what binds them to real
      // node ids. Skipping it was invisible while the live pulse only ADDED — the previously resolved
      // edge survived and masked the dangling new one. The moment a re-pulse REPLACES the file's
      // edges, the difference shows: measured, `impact shared` fell from one caller to none after an
      // edit to the calling file, because the fresh CALLS edge never bound to anything.
      const resolvedEdges = this.intraLinker.resolve(this.graph.getGraph());
      const g0 = this.graph.getGraph();
      for (const r of resolvedEdges) g0.retargetEdge(r.id, r.newTargetId);

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

      // 5. Structural Persistence Update
      //
      // `save()` WRITES NO NODES AND NO EDGES. It writes metadata and the `pulses` row and commits —
      // structure is written by `saveNodes`/`saveEdges`, which only the analyze path called. That is
      // why the watcher's write appeared to do nothing, and why purging the unit first LOST data:
      // the rows were deleted and nothing put them back. Measured: `impact shared` fell from one
      // caller to zero and stayed there through a full `analyze` (todo67 Phase 1b).
      //
      // So the unit is re-stated in the vault the same way `replaceFile` re-states it in memory:
      // purge the unit's rows and the edges it OWNS, then write its current nodes and outgoing
      // edges back. Incoming edges belong to other units and are neither purged nor rewritten here.
      if (this.options.persistence && !(this.options.persistence as any).readOnly) {
        if (this.autoPulse) console.error(`🛡️ [Conducks Watcher] Auto-Pulse: Persisting structural delta to vault...`);
        const persistence = this.options.persistence;
        const g = this.graph.getGraph();
        const lowerPath = normalizedPath.toLowerCase();
        const ids = new Set(g.getNodeIdsByFilePath(lowerPath));
        const nodes = [...ids].map(id => g.getNode(id)).filter(Boolean);
        const owned = g.getAllEdges().filter(e => ids.has(String(e.sourceId)));
        const pulseId = `watch_${Date.now()}`;
        await persistence.purgeUnits([`${lowerPath}::unit`]);
        if (nodes.length > 0) await persistence.saveNodes(nodes as any[], pulseId);
        if (owned.length > 0) await persistence.saveEdges(owned as any[], pulseId);
        await persistence.save(g);
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