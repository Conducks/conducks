/**
 * Apostle — Pulse Context
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
   * Resets the context for a fresh pulse.
   */
  public reset(): void {
    this.importMap.clear();
    this.folderMap.clear();
    this.symbolTable.clear();
  }
}
