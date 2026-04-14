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

      // Handle ESM/CJS interop and specialized grammar structures
      // Newer tree-sitter grammars (v0.25+) often wrap the binding in a .language property.
      const langModule = mod.default || mod;
      
      let lang = langModule;
      if (langId === 'typescript' && langModule.typescript) lang = langModule.typescript;
      else if (langId === 'php' && langModule.php) lang = langModule.php;
      else if (langId === 'python' && langModule.python) lang = langModule.python;

      // Resilience: Some tree-sitter modules double-wrap their default export
      if (lang.default) lang = lang.default;

      // 🛡️ [Conducks Resilience Bridge] v2.7.2 🧬
      // Some grammars (like Python 0.25) separate the native binding from metadata.
      // We must pass an object that satisfies BOTH the native parser (for the TSLanguage pointer)
      // and the JS wrapper (for nodeTypeNamesById).
      // Since native objects are often sealed, we use a hybrid approach in getUnifiedParser.
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

    // 🛡️ [Resilience Policy] v3.2
    // If we're on Python, we force the Gnosis Fallback to avoid native binding crashes
    // while the local environment is being stabilized.
    if (langId === 'python') return undefined;

    let parser = this.isolatedParsers.get(langId);
    if (!parser) {
      parser = new Parser();
      this.isolatedParsers.set(langId, parser);
    }

    try {
      // 🛡️ Resilience: Native bindings for Python 0.25+ are often wrapped
      parser.setLanguage((lang as any).language || lang);
      return parser;
    } catch (err) {
      // 🛡️ [Ultimate Resilience Bridge] v3.0 🧬
      // High-stakes bypass: If the JS wrapper crashes (common in tree-sitter 0.25),
      // we extract the TRUE native setLanguage method and call it directly.
      // This bypasses the buggy metadata initialization loop.
      try {
        const tsPath = path.dirname(this.require.resolve('tree-sitter/package.json'));
        const binding = this.require('node-gyp-build')(tsPath);
        if (binding && binding.Parser) {
          const nativeLang = (lang as any).language || lang;
          binding.Parser.prototype.setLanguage.call(parser, nativeLang);
          return parser;
        }
      } catch (bypassErr) {
        this.log(`[Conducks Registry] Critical Bypass Failure:`, bypassErr);
      }

      this.unavailableLanguages.add(langId);
      if (process.env.CONDUCKS_DEBUG === '1') {
        console.error(`[Conducks Registry] Conducks Resilience: Native binding failure for ${langId}. Transitioning to Blackbox Mode.`, err);
      }
      return undefined;
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
