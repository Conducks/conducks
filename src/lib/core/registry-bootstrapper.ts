import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { DuckDbPersistence, SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import { logger } from "@/lib/core/utils/logger.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resourcesDir = path.resolve(__dirname, "../../resources/grammars");

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
   * Autonomously resolves the nearest project root.
   */
  public discoverRoot(startPath: string): string {
    const binaryAnchor = path.dirname(__filename);
    const searchPaths = [startPath, binaryAnchor];
    const forbiddenArtifacts = ['build', 'dist', 'out', 'node_modules'];

    for (const start of searchPaths) {
      let current = path.resolve(start);
      while (current !== path.parse(current).root) {
        const isForbidden = forbiddenArtifacts.includes(path.basename(current));

        if (IgnoreManager.hasConfig(current) && !isForbidden) return current;
        if (!isForbidden && (IgnoreManager.hasPackageJson(current) || fsSync.existsSync(path.join(current, ".git")))) return current;

        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    return startPath;
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
    options: { readOnly: boolean; root?: string },
    context: {
      graph: ConducksGraph;
      persistence: SynapsePersistence;
      ignoreManager: IgnoreManager;
      federation: FederatedLinker;
      updatePersistence: (p: SynapsePersistence) => void;
      updateIgnoreManager: (i: IgnoreManager) => void;
    }
  ): Promise<void> {
    const { readOnly, root } = options;
    const { graph, persistence, ignoreManager, federation, updatePersistence, updateIgnoreManager } = context;

    if (!this.isGrammarInitialized) {
      console.error(`🛡️ [Conducks Bootstrapper] Initializing Grammar Engine...`);
      await grammars.init({ resourceDir: resourcesDir });
      await grammars.loadLanguage('python', path.join(resourcesDir, 'tree-sitter-python.wasm'));
      await grammars.loadLanguage('typescript', path.join(resourcesDir, 'tree-sitter-typescript.wasm'));
      await grammars.loadLanguage('go', path.join(resourcesDir, 'tree-sitter-go.wasm'));
      await grammars.loadLanguage('rust', path.join(resourcesDir, 'tree-sitter-rust.wasm'));
      await grammars.loadLanguage('java', path.join(resourcesDir, 'tree-sitter-java.wasm'));
      await grammars.loadLanguage('c_sharp', path.join(resourcesDir, 'tree-sitter-csharp.wasm'));
      await grammars.loadLanguage('cpp', path.join(resourcesDir, 'tree-sitter-cpp.wasm'));
      await grammars.loadLanguage('php', path.join(resourcesDir, 'tree-sitter-php.wasm'));
      await grammars.loadLanguage('javascript', path.join(resourcesDir, 'tree-sitter-javascript.wasm'));
      await grammars.loadLanguage('ruby', path.join(resourcesDir, 'tree-sitter-ruby.wasm'));
      await grammars.loadLanguage('swift', path.join(resourcesDir, 'tree-sitter-swift.wasm'));
      await grammars.loadLanguage('c', path.join(resourcesDir, 'tree-sitter-c.wasm'));
      this.isGrammarInitialized = true;
      console.error(`🛡️ [Conducks Bootstrapper] Grammar Engine Ready.`);
    }

    const baseRoot = root || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const effectiveRoot = (baseRoot === ":memory:") ? baseRoot : this.discoverRoot(baseRoot);
    
    if (effectiveRoot !== ":memory:") {
      const logPath = path.join(effectiveRoot, '.conducks', 'mcp.log');
      logger.setLogFile(logPath);
    }

    console.error(`🛡️ [Conducks Bootstrapper] Anchoring structural synapse at: ${effectiveRoot}`);
    const isCurrentlyConnected = persistence.isConnected();
    const rootChanged = chronicle.getProjectDir() !== effectiveRoot;
    const modeChanged = (persistence as any).readOnly !== readOnly;

    if (isCurrentlyConnected && !rootChanged && !modeChanged) return;

    if (rootChanged || modeChanged || !isCurrentlyConnected) {
      if (isCurrentlyConnected) await persistence.close();
      
      if (rootChanged) {
        graph.getGraph().clear();
      }

      const newPersistence = new DuckDbPersistence(effectiveRoot, readOnly);
      updatePersistence(newPersistence);
      chronicle.setProjectDir(effectiveRoot);
      
      const newIgnoreManager = new IgnoreManager(effectiveRoot);
      updateIgnoreManager(newIgnoreManager);
      
      // FIX: Use the updated instance for the initial load
      try {
        const loaded = await newPersistence.load(graph.getGraph());
        if (loaded) {
          console.error(`🛡️ [Conducks Bootstrapper] Structural graph loaded (${graph.getGraph().stats.nodeCount} nodes).`);
          await federation.hydrate(graph.getGraph());
        }
      } catch (err: any) {
        console.error(`🛡️ [Conducks Bootstrapper] Structural load failed: ${err.message}`);
      }
      return; // Wave complete
    }
    
    // Fallback: Default load if no re-connection was needed
    try {
      const loaded = await persistence.load(graph.getGraph());
      if (loaded) {
        console.error(`🛡️ [Conducks Bootstrapper] Structural graph loaded (${graph.getGraph().stats.nodeCount} nodes).`);
        await federation.hydrate(graph.getGraph());
      }
    } catch (err: any) {
      console.error(`🛡️ [Conducks Bootstrapper] Structural load failed: ${err.message}`);
    }
  }
}
