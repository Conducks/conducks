import Parser from 'tree-sitter';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Conducks — Native Grammar Registry 🛡️ 🔨
 * 
 * High-performance structural induction via native Node.js bindings.
 * Eliminates the V8 Turboshaft WASM compiler bottleneck. 🏎️
 */
export class GrammarRegistry {
  private static instance: GrammarRegistry;
  private isInitialized = false;
  private languages: Map<string, any> = new Map();
  private isolatedParsers: Map<string, Parser> = new Map();
  private unavailableLanguages: Set<string> = new Set();
  private require = createRequire(import.meta.url);

  private constructor() {}

  public static getInstance(): GrammarRegistry {
    if (!GrammarRegistry.instance) {
      GrammarRegistry.instance = new GrammarRegistry();
    }
    return GrammarRegistry.instance;
  }

  /**
   * Initializes the native parser engine.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    this.log('[Conducks Parser] Native Engine initialized.');
  }

  /**
   * Loads a language grammar using native module induction.
   */
  public async loadLanguage(langId: string): Promise<void> {
    await this.init();
    
    if (this.languages.has(langId) || this.unavailableLanguages.has(langId)) return;

    try {
      // Native Module Induction 🧬
      let mod: any;
      let packageName: string | undefined;
      switch (langId) {
        case 'typescript': packageName = 'tree-sitter-typescript'; mod = await import(packageName); break;
        case 'javascript': packageName = 'tree-sitter-javascript'; mod = await import(packageName); break;
        case 'python': packageName = 'tree-sitter-python'; mod = await import(packageName); break;
        case 'go': packageName = 'tree-sitter-go'; mod = await import(packageName); break;
        case 'rust': packageName = 'tree-sitter-rust'; mod = await import(packageName); break;
        case 'java': packageName = 'tree-sitter-java'; mod = await import(packageName); break;
        case 'csharp': packageName = 'tree-sitter-c-sharp'; mod = await import(packageName); break;
        case 'cpp': packageName = 'tree-sitter-cpp'; mod = await import(packageName); break;
        case 'php': packageName = 'tree-sitter-php'; mod = await import(packageName); break;
        case 'ruby': packageName = 'tree-sitter-ruby'; mod = await import(packageName); break;
        case 'swift': packageName = 'tree-sitter-swift'; mod = await import(packageName); break;
        case 'c': packageName = 'tree-sitter-c'; mod = await import(packageName); break;
        default:
          throw new Error(`Unsupported native language: ${langId}`);
      }

      // Handle ESM/CJS interop and specialized grammar structures (e.g., nested .typescript or .php)
      const langModule = mod.default || mod;
      
      const lang = (langId === 'typescript' && langModule.typescript) ? langModule.typescript : 
                   (langId === 'php' && langModule.php) ? langModule.php :
                   langModule;

      if (!lang || (typeof lang !== 'function' && !lang.language)) {
        throw new Error(`Invalid native language object induced for: ${langId}`);
      }

      if (!lang.nodeTypeInfo && packageName) {
        this.attachNodeTypeInfo(lang, packageName, langId);
      }

      this.languages.set(langId, lang);
      this.log(`[Conducks Parser] Induced native grammar: ${langId}`);
    } catch (err) {
      this.unavailableLanguages.add(langId);
      this.log(`[Conducks Parser] Failed to induce native ${langId}:`, err);
    }
  }

  /**
   * Provides the stable, unified parser instance set to the requested language.
   * This singleton pattern prevents memory exhaustion during large-scale pulses.
   */
  public getUnifiedParser(langId: string): Parser | undefined {
    if (this.unavailableLanguages.has(langId)) return undefined;
    const lang = this.languages.get(langId);
    if (!lang) return undefined;

    let parser = this.isolatedParsers.get(langId);
    if (!parser) {
      parser = new Parser();
      this.isolatedParsers.set(langId, parser);
    }

    try {
      parser.setLanguage(lang);
      return parser;
    } catch (err) {
      this.unavailableLanguages.add(langId);
      if (process.env.CONDUCKS_DEBUG === '1') {
        console.error(`[Conducks Registry] Conducks Resilience: Native binding failure for ${langId}. Transitioning to Blackbox Mode.`, err);
      }
      return undefined; // Signal to caller to use Degraded Induction
    }
  }

  public isLanguageUnavailable(langId: string): boolean {
    return this.unavailableLanguages.has(langId);
  }

  public getLanguage(langId: string): any | undefined {
    return this.languages.get(langId);
  }

  /**
   * Creates a structural query for a given language.
   */
  public createQuery(lang: any, source: string): any {
    return new Parser.Query(lang, source);
  }

  private attachNodeTypeInfo(lang: any, packageName: string, langId: string): void {
    try {
      const modulePath = this.require.resolve(packageName);
      const moduleDir = path.dirname(modulePath);
      const candidates = [
        path.join(moduleDir, 'node-types.json'),
        path.join(moduleDir, '..', 'node-types.json'),
        path.join(moduleDir, '..', '..', 'node-types.json')
      ];

      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          lang.nodeTypeInfo = parsed;
          this.log(`[Conducks Parser] Attached nodeTypeInfo for ${langId} from ${path.relative(process.cwd(), candidate)}`);
          return;
        }
      }
    } catch (err) {
      this.log(`[Conducks Parser] Failed to attach nodeTypeInfo for ${langId}:`, err);
    }
  }

  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}

export const grammars = GrammarRegistry.getInstance();
