import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import { logger } from "@/lib/core/utils/logger.js";
import { traceMemory } from "@/lib/core/utils/mem-trace.js";
import { isNeverAProjectRoot } from "@/lib/core/utils/scope-guard.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Registry Bootstrapper (Capability Layer)
 * 
 * Handles the heavy lifting of environment discovery, grammar initialization,
 * and structural anchor resolution. This ensures the Registry remains a 
 * pure composition point.
 */
export class RegistryBootstrapper {
  private isGrammarInitialized = false;

  /**
   * Set when `lazy` deferred the graph load; null once the graph is materialised.
   *
   * It takes the persistence to load FROM rather than capturing one, because the connection this
   * decision was made on may be closed by the time anyone needs the graph — the read-only path
   * closes after every load. Resolving it at call time means the loader always uses whatever the
   * registry currently holds, and `load()` reopens a closed vault on its own.
   */
  private pendingLoad: ((p: SynapsePersistence) => Promise<void>) | null = null;

  /** True while a graph load has been deferred and not yet run. */
  public get graphIsDeferred(): boolean { return this.pendingLoad !== null; }

  /** The load that is currently running, so a second caller WAITS for it instead of racing past it. */
  private loadInFlight: Promise<void> | null = null;

  /**
   * Materialise the graph if something deferred it. A no-op once loaded, so any number of callers
   * cost one load.
   *
   * CONCURRENCY. This used to clear `pendingLoad` and only then await the load, which is check-then-act:
   * caller A took the pending load and nulled the field, and caller B — arriving while A was still
   * materialising thousands of nodes — saw null, returned immediately believing the graph was ready,
   * and walked an EMPTY one. It did not throw; it answered. Measured over real stdio JSON-RPC with
   * four pipelined `conducks_impact` calls: three came back `SYMBOL_NOT_FOUND` for a symbol that
   * demonstrably exists, because "no node matched" and "no nodes at all" are the same observation to
   * every caller downstream. The comment above claimed "a no-op once loaded" while the code was a
   * no-op once loading had STARTED — the invariant stated was not the one implemented.
   *
   * Now the in-flight promise is memoised and returned, so a concurrent caller awaits the same load.
   * Still exactly one load; the difference is that the second caller waits for it rather than
   * overtaking it.
   */
  public async ensureGraphLoaded(persistence: SynapsePersistence): Promise<void> {
    // A load is already running — join it rather than proceeding on an unloaded graph.
    if (this.loadInFlight) return this.loadInFlight;

    const pending = this.pendingLoad;
    if (!pending) return;
    this.pendingLoad = null;

    // On FAILURE the pending load is restored. Without this a load that threw left `pendingLoad`
    // null forever, so every later caller took the "already loaded" path and answered from an empty
    // graph — the same silent false-negative this fix exists to remove, just reached another way.
    this.loadInFlight = pending(persistence)
      .catch(err => { this.pendingLoad = pending; throw err; })
      .finally(() => { this.loadInFlight = null; });

    return this.loadInFlight;
  }

  /**
   * The nearest ANCESTOR (or self) declaring a workspace with a `conducks.json`, or null.
   *
   * Nearest wins on purpose: a vendored dependency that is itself a monorepo should be able to
   * declare its own workspace and have paths beneath it answer from that, rather than being
   * absorbed by the outer one. That case is untested — ADR 0069 records it as open.
   *
   * The same scope guard the marker walk uses applies here, so a stray `conducks.json` under
   * `/private/tmp` or a home directory cannot claim the tree above it.
   */
  private findDeclaredWorkspace(from: string): string | null {
    let current = from;
    while (current && current !== path.parse(current).root) {
      if (!isNeverAProjectRoot(current) && fsSync.existsSync(path.join(current, 'conducks.json'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  /** Memoized per start path — see `discoverRoot`. */
  private rootCache = new Map<string, string>();

  /**
   * Resolves the root conducks anchors to: a declared workspace if there is one, otherwise the
   * nearest inferred project marker.
   *
   * Memoized because it is now asked TWICE per run: the CLI needs the answer before it can create
   * persistence, and `initialize` asks again. Without the cache the "no project marker found"
   * fallback warning — which is the one line a user in the wrong directory must read — printed
   * twice, and a doubled warning reads as two problems (ADR 0116).
   */
  public discoverRoot(startPath: string): string {
    const cached = this.rootCache.get(startPath);
    if (cached !== undefined) return cached;
    const found = this.discoverRootUncached(startPath);
    this.rootCache.set(startPath, found);
    return found;
  }

  private discoverRootUncached(startPath: string): string {
    const searchPaths = [startPath];
    const forbiddenArtifacts = ['build', 'dist', 'out', 'node_modules'];

    // PASS 1 — a DECLARED workspace, searched all the way up before anything is inferred (ADR 0069).
    //
    // This has to be its own walk, not a reordered check inside the one below. The marker walk
    // returns at the FIRST directory carrying any marker, so a service with its own package.json
    // would still win before the workspace above it was ever looked at — which is precisely the bug:
    // `mentorseed/app` anchored at `app`, while `mentorseed/database`, having no marker of its own,
    // walked up and planted a SECOND vault at the repository root holding 40 nodes. Same repo, two
    // vaults, neither seeing the monorepo.
    //
    // Searching for the declaration separately, and first, is what makes one workspace one vault
    // regardless of which service you happen to point at.
    const declared = this.findDeclaredWorkspace(startPath ? path.resolve(startPath) : process.cwd());
    if (declared) return declared;

    for (const start of searchPaths) {
      let current = start ? path.resolve(start) : process.cwd();
      
      // Safety check: ensure we don't start at root
      if (current === '/' || current === '\\') {
        continue;
      }

      while (current !== path.parse(current).root) {
        const isForbidden = forbiddenArtifacts.includes(path.basename(current));

        // A system, home-level or tooling directory is never a project root, whatever it contains.
        // Checked BEFORE the markers below, because the `.conducks` rule would otherwise let one
        // stray vault in `/private/tmp` claim every tree under it — measured, and it silently
        // analyzed 2,323 unrelated files. The predicate is the scope guard's, not a second copy.
        if (isForbidden || isNeverAProjectRoot(current)) {
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
          continue;
        }

        // 🛡️ [Conducks Priority] Structural Vault FIRST 🏺
        if (fsSync.existsSync(path.join(current, ".conducks"))) return current;

        // 🛡️ [Project Markers] Fallback to Repository markers
        const localMarkers = ['package.json', 'requirements.txt', 'pyproject.toml', 'tsconfig.json', 'go.mod', 'Cargo.toml', 'composer.json'];
        const hasMarker = localMarkers.some(m => fsSync.existsSync(path.join(current, m)));

        if (IgnoreManager.hasConfig(current)) return current;
        if (hasMarker || fsSync.existsSync(path.join(current, ".git"))) return current;

        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    
    // Reached the system root without finding a marker. The fallback stands — refusing here would
    // break a scratch directory, a fresh checkout before its manifest exists, and every test
    // fixture — but it is now SAID OUT LOUD. Silently anchoring to cwd is the shape that once let
    // a stray vault in `/private/tmp` claim 2,323 unrelated files: the analyze looked normal
    // throughout, because nothing on the way in ever named the directory it had chosen.
    const chosen = startPath ? path.resolve(startPath) : process.cwd();
    logger.warn(`🛡️ [Conducks] No project marker found above ${chosen} — no .conducks, .git, package.json, tsconfig.json, go.mod, Cargo.toml, pyproject.toml, requirements.txt or composer.json. Anchoring HERE by fallback. If that is not your project root, pass the path explicitly.`);
    return chosen;
  }

  /**
   * Recursively discovers all sub-projects/repositories within a workspace.
   */
  public discoverProjects(workspaceRoot: string): string[] {
    const projects: string[] = [];
    const forbiddenDirs = ['node_modules', 'build', 'dist', 'out', '.git', 'venv', '__pycache__'];

    const scan = (current: string) => {
      const stats = fsSync.statSync(current);
      if (!stats.isDirectory()) return;

      const items = fsSync.readdirSync(current, { withFileTypes: true });
      let isProject = false;

      // 1. Check for project markers in current dir
      for (const item of items) {
        if (item.name === '.conducks' || item.name === 'package.json' || item.name === '.git' || item.name === 'pyproject.toml') {
          isProject = true;
          break;
        }
      }

      if (isProject) {
        projects.push(path.resolve(current));
        // Note: For now, we continue scanning indoors to find sub-projects/submodules
      }

      for (const item of items) {
        if (item.isDirectory() && !forbiddenDirs.includes(item.name)) {
          try {
            scan(path.join(current, item.name));
          } catch { /* Permission denied or similar */ }
        }
      }
    };

    try {
      scan(workspaceRoot);
    } catch { /* Root access fail */ }

    return projects.length > 0 ? Array.from(new Set(projects)) : [workspaceRoot];
  }

  /**
   * High-fidelity initialization wave.
   */
  public async initialize(
    options: { readOnly: boolean; root?: string; lazy?: boolean },
    context: {
      graph: ConducksGraph;
      persistence: SynapsePersistence;
      ignoreManager: IgnoreManager;
      federation: FederatedLinker;
      updatePersistence: (p: SynapsePersistence) => void;
      updateIgnoreManager: (i: IgnoreManager) => void;
    }
  ): Promise<void> {
    traceMemory('bootstrapper entry (modules loaded)');
    const { readOnly, root, lazy } = options;
    const { graph, persistence, ignoreManager, federation, updatePersistence, updateIgnoreManager } = context;

    if (!this.isGrammarInitialized) {
      logger.boot(`🛡️ [Conducks Bootstrapper] Initializing Native Grammar Engine...`);
      await grammars.init();
      await grammars.loadLanguage('python');
      await grammars.loadLanguage('typescript');
      await grammars.loadLanguage('go');
      await grammars.loadLanguage('rust');
      await grammars.loadLanguage('java');
      await grammars.loadLanguage('csharp');
      await grammars.loadLanguage('cpp');
      await grammars.loadLanguage('php');
      await grammars.loadLanguage('javascript');
      await grammars.loadLanguage('ruby');
      await grammars.loadLanguage('swift');
      await grammars.loadLanguage('c');
      this.isGrammarInitialized = true;
      logger.boot(`🛡️ [Conducks Bootstrapper] Native Grammar Engine Ready.`);
      traceMemory('after 12 grammars loaded');
    }

    const baseRoot = root || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const effectiveRoot = (baseRoot === ":memory:") ? baseRoot : this.discoverRoot(baseRoot);
    
    // The log sink never BRINGS A VAULT INTO BEING. `setLogFile` mkdirs its parent, so anchoring it
    // here created a `.conducks/` in whatever directory the run started from — and a run that then
    // failed to find a vault left one behind that reads as a project next time. A write session
    // creates the directory itself moments later, so the only case skipped is the very first
    // `analyze` in a fresh tree, which has nothing to log about the previous one anyway (ADR 0116).
    if (effectiveRoot !== ":memory:") {
      const vaultDir = path.join(effectiveRoot, '.conducks');
      if (!readOnly || fsSync.existsSync(vaultDir)) {
        logger.setLogFile(path.join(vaultDir, 'mcp.log'));
      }
    }

    logger.boot(`🛡️ [Conducks Bootstrapper] Anchoring structural synapse at: ${effectiveRoot}`);
    const isCurrentlyConnected = persistence.isConnected();
    // Ask the HANDLE where it points, not the chronicle. `chronicle.getProjectDir()` says where the
    // registry is anchored, which is not the same question: the module-level placeholder is
    // `new SynapsePersistence(":memory:", true)`, so a `:memory:` handle under a chronicle already
    // anchored to a real repo answered "root unchanged" and was reused — measured as
    // `[No Vault] :memory: has no .conducks/` from a tool call against an analyzed repo (todo52).
    // The old `!isCurrentlyConnected` term hid this: the placeholder is disconnected, so it was
    // replaced for the wrong reason and the wrong question was never noticed.
    const handleRoot = (persistence as any).anchoredAt;
    const rootChanged = chronicle.getProjectDir() !== effectiveRoot
      || (typeof handleRoot === 'string' && handleRoot !== effectiveRoot);
    const modeChanged = (persistence as any).readOnly !== readOnly;

    // Same root, same mode: there is NOTHING to do, connected or not.
    //
    // `isCurrentlyConnected` used to be part of this test, which sent every post-`releaseAnchor()`
    // call down the re-init path. That did two harmful things: it swapped the handle (the race
    // ADR 0146 serialised against), and it fell through to the tail, which calls
    // `graph.getGraph().markDeferred()` — re-deferring an ALREADY MATERIALISED graph on every single
    // call and re-arming `pendingLoad`. After the first boot, `!rootChanged && !modeChanged` can only
    // mean "already set up", because a fresh process starts on the `:memory:` placeholder and so
    // always sees `rootChanged` once (todo52).
    if (!rootChanged && !modeChanged) return;

    // A CLOSED handle is not a reason to build a new one — only a changed root or mode is.
    //
    // `releaseAnchor()` closes the vault at the end of every tool call, deliberately, so the user can
    // run CLI commands against the same DuckDB file. With `!isCurrentlyConnected` in this condition,
    // the NEXT call found a disconnected handle and swapped it: `updatePersistence(new
    // SynapsePersistence(...))` on EVERY call, in the steady state, with nothing changed but our own
    // close. Measured in `persistence-handle-owner.test.ts` — one swap per call, zero from the anchor.
    //
    // That swap is precisely the hazard ADR 0146 serialised every tool call to avoid ("no ref-count
    // makes an object swap atomic"), so the queue was paying ~8x to defend against a race this line
    // was manufacturing. `anchor.ts` already stated the right policy — "Disconnection is NOT a re-init
    // trigger — the lazy connection reopens on next query" — and `SynapsePersistence.query()` does
    // reopen via `ensureVaultOpen()`. The bootstrapper simply disagreed with it (todo52).
    if (rootChanged || modeChanged) {
      // A previous root's deferred load must never survive into this one. Nulled HERE rather than at
      // the top of this method: the top runs on every call, and a call that changes nothing used to
      // clobber an armed `pendingLoad` and then re-arm it further down. Once the re-anchor path stops
      // running for an unchanged anchor, that re-arm is gone — so clearing it unconditionally would
      // leave the graph deferred forever and every tool would answer SYMBOL_NOT_FOUND against an
      // empty graph. Measured exactly that way while removing the queue (todo52).
      this.pendingLoad = null;
      if (isCurrentlyConnected) await persistence.close();
      
      if (rootChanged) {
        graph.getGraph().clear();
      }

      const newPersistence = new SynapsePersistence(effectiveRoot, readOnly);
      updatePersistence(newPersistence);
      chronicle.setProjectDir(effectiveRoot);
      
      const newIgnoreManager = new IgnoreManager(effectiveRoot);
      updateIgnoreManager(newIgnoreManager);
      
      // Materialising the graph costs ~165 MB and 146 ms for 2,381 nodes and 12,590 edges, and a
      // read-only caller frequently never walks it. `lazy` defers that to the first caller who
      // does — which is what the flag always promised: it was destructured here and never read, so
      // every read-only process paid a full load to answer questions that touched no node.
      if (lazy) {
        // Mark the GRAPH, not just the registry accessor. Services capture `graph.getGraph()` at
        // construction and hold it directly, so the accessor guard never runs for them and a
        // deferred graph reads as an empty one (todo21#P5).
        graph.getGraph().markDeferred();
        this.pendingLoad = async (current) => {
          await current.load(graph.getGraph());
          graph.getGraph().markMaterialised();
          await federation.hydrate(graph.getGraph());
        };
        return;
      }

      // FIX: Use the updated instance for the initial load
      try {
        await newPersistence.load(graph.getGraph());
        logger.boot(`🛡️ [Conducks Bootstrapper] Structural graph loaded (${graph.getGraph().stats.nodeCount} nodes).`);
        await federation.hydrate(graph.getGraph());
      } catch (err: any) {
        console.error(`🛡️ [Conducks Bootstrapper] Structural load failed: ${err.message}`);
      } finally {
        if (readOnly) await newPersistence.close();
      }
      return; // Wave complete
    }
    
    if (lazy) {
      graph.getGraph().markDeferred();
      this.pendingLoad = async (current) => {
        await current.load(graph.getGraph());
        graph.getGraph().markMaterialised();
        await federation.hydrate(graph.getGraph());
      };
      return;
    }

    // Fallback: Default load if no re-connection was needed
    try {
      await persistence.load(graph.getGraph());
      console.error(`🛡️ [Conducks Bootstrapper] Structural graph loaded (${graph.getGraph().stats.nodeCount} nodes).`);
      await federation.hydrate(graph.getGraph());
    } catch (err: any) {
      console.error(`🛡️ [Conducks Bootstrapper] Structural load failed: ${err.message}`);
    } finally {
      if (readOnly) await persistence.close();
    }
  }
}
