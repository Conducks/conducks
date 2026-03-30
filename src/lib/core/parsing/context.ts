/**
 * Conducks — Pulse Context
 * 
 * Manages the state and cache during a multi-pass topological pulse.
 */

export class PulseContext {
  /** Map of file paths to their direct dependencies (Import Map) */
  private importMap: Map<string, Set<string>> = new Map();

  /** Map of folder paths to their constituent files */
  private folderMap: Map<string, Set<string>> = new Map();

  /** Global Symbol Table (Symbols discovered during Pass 2) */
  private symbolTable: Map<string, any> = new Map();

  /** Known External Packages (pip, npm) discovered during Essence refraction */
  private externalPackages: Set<string> = new Set();

  /** Detected Application Framework (FastAPI, Flask, Next.js, Express) */
  private framework: string | null = null;
  
  /** Local Symbol Bindings (current file only) — Maps LocalName to SourcePath */
  private localBindings: Map<string, string> = new Map();

  /**
   * Registers a dependency relationship.
   */
  public registerImport(caller: string, target: string): void {
    if (!this.importMap.has(caller)) this.importMap.set(caller, new Set());
    this.importMap.get(caller)!.add(target);
  }

  /**
   * Registers a symbol in the global table for cross-file resolution.
   */
  public registerSymbol(symbolId: string, node: any): void {
    this.symbolTable.set(symbolId, node);
  }

  /**
   * Returns the import map for topological sorting.
   */
  public getImportMap(): Map<string, Set<string>> {
    return this.importMap;
  }

  /**
   * Returns a specific symbol if found.
   */
  public getSymbol(symbolId: string): any | undefined {
    return this.symbolTable.get(symbolId);
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
    // Handle both exact match and sub-module matches (e.g. 'requests' or 'requests.models')
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
   * Conducks.6: Registers a local symbol-to-source mapping for the current unit.
   */
  public registerLocalBinding(localName: string, sourcePath: string): void {
    this.localBindings.set(localName, sourcePath);
  }

  /**
   * Conducks.6: Resolves a local symbol name to its absolute source path.
   */
  public resolveLocalBinding(localName: string): string | undefined {
    return this.localBindings.get(localName);
  }

  /**
   * Conducks.6: Clears local bindings (scoped to a single file reflection).
   */
  public clearLocalBindings(): void {
    this.localBindings.clear();
  }

  /**
   * Resets the context for a fresh pulse.
   */
  public reset(): void {
    this.importMap.clear();
    this.folderMap.clear();
    this.symbolTable.clear();
    this.externalPackages.clear();
    this.framework = null;
  }
}
