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
    return this.externalPackages.has(root);
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
  public registerLocalBinding(localName: string, sourcePath: string): void {
    this.localBindings.set(localName.toLowerCase(), sourcePath.toLowerCase());
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
  }


  /**
   * Universal State Export: Capture registry, imports, and packages for worker-to-main reduction.
   */
  public exportState(): any {
    return {
      registry: Object.fromEntries(this.registry),
      externalPackages: Array.from(this.externalPackages),
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
    this.framework = null;
    this.discoveryMode = false;
  }
}
