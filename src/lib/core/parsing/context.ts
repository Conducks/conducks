/**
 * Conducks — Analyze Context
 * 
 * Manages the state and cache during a multi-pass topological analyze pulse.
 */

export class AnalyzeContext {
  /** Map of file paths to their direct dependencies (Import Map) */
  private importMap: Map<string, Set<string>> = new Map();

  /** Map of folder paths to their constituent files */
  private folderMap: Map<string, Set<string>> = new Map();

  /** 
   * Global Symbol Registry (The "Discovery" Cache)
   * Maps FQN (package::module::symbol) to its discovered metadata.
   */
  private registry: Map<string, any> = new Map();

  /** Known External Packages (pip, npm) discovered during Essence refraction */
  private externalPackages: Set<string> = new Set();

  /** Detected Application Framework (FastAPI, Flask, Next.js, Express) */
  private framework: string | null = null;
  
  /** Local Symbol Bindings (current file only) — Maps LocalName to SourcePath */
  private localBindings: Map<string, string> = new Map();
  /**
   * A renamed binding's ORIGINAL exported name, keyed by the local name.
   *
   * `import { POST as stepAction }` means calls to `stepAction` run `POST`. Storing only the path
   * made `CallProcessor` build `<route>::stepaction` — an id no node has, so the call dangled where
   * nothing else owned the local name and, worse, bound to an unrelated same-named export where
   * something did (ADR 0085).
   */
  private bindingOriginals: Map<string, string> = new Map();

  /** Analysis Mode: Discovery (Pass 1) vs Resolution (Pass 2) */
  private discoveryMode: boolean = false;

  public setDiscoveryMode(active: boolean): void {
    this.discoveryMode = active;
  }

  public isDiscoveryMode(): boolean {
    return this.discoveryMode;
  }

  public isResolutionMode(): boolean {
    return !this.discoveryMode;
  }

  /**
   * Registers a dependency relationship.
   */
  public registerImport(caller: string, target: string): void {
    if (!this.importMap.has(caller)) this.importMap.set(caller, new Set());
    this.importMap.get(caller)!.add(target);
  }

  /**
   * Registers a symbol in the global registry for cross-file resolution.
   */
  public registerGlobalSymbol(fqn: string, metadata: any): void {
    this.registry.set(fqn.toLowerCase(), metadata);
  }

  /**
   * Returns a specific global symbol if found.
   */
  public getGlobalSymbol(fqn: string): any | undefined {
    return this.registry.get(fqn.toLowerCase());
  }

  /**
   * Checks if an FQN exists in the registry.
   */
  public hasGlobalSymbol(fqn: string): boolean {
    return this.registry.has(fqn.toLowerCase());
  }

  /**
   * Returns the import map for topological sorting.
   */
  public getImportMap(): Map<string, Set<string>> {
    return this.importMap;
  }

  /**
   * Registers an external package name.
   */
  public registerExternalPackage(name: string): void {
    this.externalPackages.add(name);
  }

  /**
   * Returns whether a name is a known external package.
   */
  public isExternalPackage(name: string): boolean {
    const root = name.split('.')[0];
    // A WORKSPACE package is declared as a dependency by the apps that consume it, so it appears in
    // `externalPackages` too. Internal wins: it has real source in this tree (ADR 0108).
    if (this.workspacePackages.has(root.toLowerCase())) return false;
    return this.externalPackages.has(root);
  }

  /**
   * Packages whose SOURCE lives in this tree, name → the directory holding their `package.json`.
   *
   * In a pnpm/npm/yarn workspace, `@repo/adapters` is a bare specifier that resolves to
   * `packages/adapters` — not to `node_modules`. `classifyOrigin` saw a bare scoped name and called
   * it a third-party dependency, so every cross-package call landed on a synthetic `external://`
   * node instead of the real function. Measured on openship (1,897 files): **705 phantom nodes and
   * 1,771 CALLS edges** pointing at them, and the real `allocateHostPort` showed ZERO callers while
   * two calls to it sat on a node with `lineStart: 0` (ADR 0108).
   *
   * Any `package.json` inside the analyzed tree declares a local package — no need to parse
   * `pnpm-workspace.yaml` or the `workspaces` field, and it works for every layout that puts a
   * manifest beside the code.
   */
  private workspacePackages: Map<string, string> = new Map();

  public registerWorkspacePackage(name: string, dir: string): void {
    if (!name) return;
    this.workspacePackages.set(name.toLowerCase(), dir);
  }

  /** The directory a bare specifier belongs to, or null when it is genuinely external. */
  public resolveWorkspacePackage(specifier: string): { dir: string; subpath: string } | null {
    const spec = (specifier || '').replace(/^['"]|['"]$/g, '');
    if (!spec || spec.startsWith('.') || spec.startsWith('/')) return null;
    const seg = spec.split('/');
    // A scoped package name is the first TWO segments; anything after is a subpath.
    const name = (spec.startsWith('@') && seg.length >= 2 ? `${seg[0]}/${seg[1]}` : seg[0]).toLowerCase();
    const dir = this.workspacePackages.get(name);
    if (!dir) return null;
    const consumed = name.split('/').length;
    return { dir, subpath: seg.slice(consumed).join('/') };
  }

  public getWorkspacePackages(): Array<[string, string]> {
    return Array.from(this.workspacePackages.entries());
  }

  public setFramework(framework: string): void {
    this.framework = framework;
  }

  public getFramework(): string | null {
    return this.framework;
  }

  /**
   * Registers a local symbol-to-source mapping for the current unit.
   */
  public registerLocalBinding(localName: string, sourcePath: string, originalName?: string): void {
    this.localBindings.set(localName.toLowerCase(), sourcePath.toLowerCase());
    if (originalName && originalName.toLowerCase() !== localName.toLowerCase()) {
      this.bindingOriginals.set(localName.toLowerCase(), originalName.toLowerCase());
    }
  }

  /** The name a renamed binding really refers to in its source module, if it was renamed. */
  public resolveBindingOriginal(localName: string): string | undefined {
    return this.bindingOriginals.get(localName.toLowerCase());
  }

  /**
   * Resolves a local symbol name to its absolute source path.
   */
  public resolveLocalBinding(localName: string): string | undefined {
    return this.localBindings.get(localName.toLowerCase());
  }

  /**
   * Clears local bindings (scoped to a single file reflection).
   */
  public clearLocalBindings(): void {
    this.localBindings.clear();
    this.bindingOriginals.clear();
  }


  /**
   * Universal State Export: Capture registry, imports, and packages for worker-to-main reduction.
   */
  public exportState(): any {
    return {
      registry: Object.fromEntries(this.registry),
      externalPackages: Array.from(this.externalPackages),
      // Workers resolve imports themselves, so they need the workspace map or every cross-package
      // specifier reverts to "external" inside the worker (ADR 0108).
      workspacePackages: Array.from(this.workspacePackages.entries()),
      importMap: Object.fromEntries(
        Array.from(this.importMap.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      framework: this.framework
    };
  }

  /**
   * Master Registry Merge: Consolidate worker results into the global context.
   */
  public mergeState(state: any): void {
    if (!state) return;

    if (state.registry) {
      for (const [id, sym] of Object.entries(state.registry)) {
        this.registry.set(id.toLowerCase(), sym);
      }
    }

    if (state.externalPackages) {
      for (const pkg of state.externalPackages) {
        this.externalPackages.add(pkg);
      }
    }

    if (state.workspacePackages) {
      for (const [name, dir] of state.workspacePackages as Array<[string, string]>) {
        this.workspacePackages.set(name, dir);
      }
    }

    if (state.importMap) {
      for (const [caller, targets] of Object.entries(state.importMap)) {
        if (!this.importMap.has(caller)) this.importMap.set(caller, new Set());
        for (const t of (targets as string[])) {
          this.importMap.get(caller)!.add(t);
        }
      }
    }

    if (state.framework && !this.framework) {
      this.framework = state.framework;
    }
  }

  /**
   * Batch sets global symbols (used to sync workers with master registry).
   */
  public setRegisteredSymbols(symbols: Record<string, any>): void {
    for (const [id, sym] of Object.entries(symbols)) {
      this.registry.set(id.toLowerCase(), sym);
    }
  }

  /**
   * Resets the context for a fresh pulse.
   */
  public reset(): void {
    this.importMap.clear();
    this.folderMap.clear();
    this.registry.clear();
    this.externalPackages.clear();
    this.workspacePackages.clear();
    this.framework = null;
    this.discoveryMode = false;
  }
}
