import * as Parser from 'web-tree-sitter';
import path from 'node:path';

/**
 * Conducks — WASM Grammar Registry
 * 
 * Manages the high-performance Tree-sitter WASM grammars.
 * Provides a unified interface for language-specific parsing.
 */
export class GrammarRegistry {
  private static instance: GrammarRegistry;
  private isInitialized = false;
  private languages: Map<string, Parser.Language> = new Map();
  private unifiedParser: any | undefined;

  private constructor() {}

  /**
   * Provides the Query constructor for structural analysis.
   */
  public getQueryConstructor(): any {
    return Parser.Query;
  }

  public static getInstance(): GrammarRegistry {
    if (!GrammarRegistry.instance) {
      GrammarRegistry.instance = new GrammarRegistry();
    }
    return GrammarRegistry.instance;
  }

  /**
   * Initializes the WASM parser engine.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    
    // Explicitly access the Parser class from the namespace
    const ParserClass = (Parser as any).default || (Parser as any).Parser || Parser;
    
    if (typeof ParserClass.init === 'function') {
      await ParserClass.init();
    }
    
    this.unifiedParser = new (ParserClass as any)();
    this.isInitialized = true;
    console.error('[Conducks Parser] WASM Engine initialized.');
  }

  /**
   * Loads a language grammar from a WASM file.
   */
  public async loadLanguage(langId: string, wasmPath: string): Promise<void> {
    await this.init();
    try {
      const lang = await (Parser as any).Language.load(wasmPath);
      this.languages.set(langId, lang);
      console.error(`[Conducks Parser] Loaded grammar: ${langId}`);
    } catch (err) {
      console.error(`[Conducks Parser] Failed to load ${langId} from ${wasmPath}:`, err);
    }
  }

  /**
   * Provides the stable, unified parser instance set to the requested language.
   * This singleton pattern prevents WASM memory exhaustion during large-scale pulses.
   */
  public getUnifiedParser(langId: string): any | undefined {
    const lang = this.languages.get(langId);
    if (!lang || !this.unifiedParser) return undefined;
    
    this.unifiedParser.setLanguage(lang);
    return this.unifiedParser;
  }

  public getLanguage(langId: string): Parser.Language | undefined {
    return this.languages.get(langId);
  }
}

export const grammars = GrammarRegistry.getInstance();
