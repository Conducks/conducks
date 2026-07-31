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

  /**
   * Materialise the graph if something deferred it. A no-op once loaded, so any number of callers
   * cost one load.
   */
  public async ensureGraphLoaded(persistence: SynapsePersistence): Promise<void> {
    const pending = this.pendingLoad;
    if (!pending) return;
    this.pendingLoad = null;
    await pending(persistence);
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

  /**
   * Resolves the root conducks anchors to: a declared workspace if there is one, otherwise the
   * nearest inferred project marker.
   */
  public discoverRoot(startPath: string): string {
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
    // A previous root's deferred load must never survive into this one.
    this.pendingLoad = null;
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
    
    if (effectiveRoot !== ":memory:") {
      const logPath = path.join(effectiveRoot, '.conducks', 'mcp.log');
      logger.setLogFile(logPath);
    }

    logger.boot(`🛡️ [Conducks Bootstrapper] Anchoring structural synapse at: ${effectiveRoot}`);
    const isCurrentlyConnected = persistence.isConnected();
    const rootChanged = chronicle.getProjectDir() !== effectiveRoot;
    const modeChanged = (persistence as any).readOnly !== readOnly;

    if (isCurrentlyConnected && !rootChanged && !modeChanged) return;

    if (rootChanged || modeChanged || !isCurrentlyConnected) {
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
        this.pendingLoad = async (current) => {
          await current.load(graph.getGraph());
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
      this.pendingLoad = async (current) => {
        await current.load(graph.getGraph());
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
