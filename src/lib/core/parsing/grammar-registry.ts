import * as Parser from 'web-tree-sitter';
import path from 'node:path';
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  private parserClass: any | undefined;

  private constructor() {}

  /**
   * Creates a structural query for a given language.
   * This uses the modern language.query(source) API for 0.24.x compatibility.
   */
  public createQuery(language: any, source: string): any {
    return language.query(source);
  }

  public static getInstance(): GrammarRegistry {
    if (!GrammarRegistry.instance) {
      GrammarRegistry.instance = new GrammarRegistry();
    }
    return GrammarRegistry.instance;
  }

  /**
   * Initializes the tree-sitter engine.
   * Universal WASM Localization: Uses 'locateFile' to ensure the core 'tree-sitter.wasm'
   * is found in our synchronized resource directory across parent and worker threads.
   */
  public async init(options?: { resourceDir?: string }): Promise<void> {
    if (this.isInitialized) return;
    
    this.parserClass = (Parser as any).default || (Parser as any).Parser || Parser;
    if (typeof this.parserClass.init === 'function') {
      const initOptions: any = {};
      
      if (options?.resourceDir) {
        initOptions.locateFile = (file: string) => {
          if (file === 'tree-sitter.wasm') {
            return path.join(options.resourceDir!, 'tree-sitter.wasm');
          }
          return file;
        };
      }
      
      await this.parserClass.init(initOptions);
    }
    
    this.unifiedParser = new (this.parserClass as any)();
    this.isInitialized = true;
    this.log('[Conducks Parser] WASM Engine initialized.');
  }

  /**
   * Loads a language grammar from a WASM file.
   */
  public async loadLanguage(langId: string, wasmPath: string): Promise<void> {
    await this.init();
    if (!existsSync(wasmPath)) {
      this.log(`[Conducks Parser] WASM Missing: ${langId} -> ${wasmPath}`);
      return;
    }
    try {
      // Robust buffer-based loading to bypass path resolution issues
      const uint8 = new Uint8Array(readFileSync(wasmPath));
      
      if (!this.parserClass) {
        await this.init();
      }
      
      const lang = await this.parserClass.Language.load(uint8);
      
      this.languages.set(langId, lang);
      this.log(`[Conducks Parser] Loaded grammar: ${langId}`);
    } catch (err) {
      this.log(`[Conducks Parser] Failed to load ${langId} from ${wasmPath}:`, err);
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

  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}

export const grammars = GrammarRegistry.getInstance();
