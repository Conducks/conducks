import type Parser from 'tree-sitter';
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
  // Compiled tree-sitter queries, keyed on the `lang` object identity and then on the query
  // source string. `lang` is the same object for a given langId for the life of the process
  // (loadLanguage sets it once and guards re-entry), and `queryScm` is a readonly per-provider
  // constant, so this caches "once per language per process" without any caller changes. See
  // ADR 0065.
  private queryCache: Map<any, Map<string, any>> = new Map();
  private require = createRequire(import.meta.url);
  private nativeParser: any | undefined;
  private nativeLoadFailed = false;

  /** Private: one registry per process, because a tree-sitter binding serves one wrapper (ADR 0027). */
  private constructor() {}

  /**
   * Loads the native `tree-sitter` binding on demand.
   *
   * `tree-sitter` is an OPTIONAL dependency: its core package ships no prebuilds, so it compiles
   * from source at install time and is simply absent on a machine without a C++ toolchain. A static
   * import would crash module load there, so every runtime use goes through here and a missing
   * binding is reported by `isNativeAvailable()` instead of throwing. See ADR 0027.
   *
   * A missing binding does NOT degrade — ADR 0089 deleted the regex fallback, so it is the whole
   * parse path. `analyze` checks `isNativeAvailable()` once and refuses up front rather than failing
   * per file; this loader's only job is to make absence askable instead of fatal at import.
   */
  private loadNative(): any | undefined {
    if (this.nativeParser) return this.nativeParser;
    if (this.nativeLoadFailed) return undefined;
    try {
      this.nativeParser = this.require('tree-sitter');
      return this.nativeParser;
    } catch (err) {
      this.nativeLoadFailed = true;
      this.log('[Conducks Parser] Native binding unavailable — all languages fall back to Gnosis.', err);
      return undefined;
    }
  }

  /**
   * Whether the native binding could be loaded. `false` means every file goes through Gnosis.
   */
  public isNativeAvailable(): boolean {
    return this.loadNative() !== undefined;
  }

  /** The process-wide registry. The singleton is the point — grammars are expensive and shared. */
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

    // No native binding means no grammar can be induced at all — mark it and let Gnosis take over.
    if (!this.loadNative()) {
      this.unavailableLanguages.add(langId);
      return;
    }

    try {
      // Native Module Induction 🧬
      let mod: any;
      let packageName: string | undefined;
      switch (langId) {
        case 'typescript': packageName = 'tree-sitter-typescript'; mod = await import(packageName); break;
        case 'tsx': packageName = 'tree-sitter-typescript'; mod = await import(packageName); break;
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
      else if (langId === 'tsx' && langModule.tsx) lang = langModule.tsx;
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
      if (packageName) this.attachNodeTypeInfo(lang, packageName, langId);
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

    const NativeParser = this.loadNative();
    if (!NativeParser) return undefined;

    let parser = this.isolatedParsers.get(langId);
    if (!parser) {
      parser = new NativeParser() as Parser;
      this.isolatedParsers.set(langId, parser);
    }

    try {
      // 🛡️ Resilience: Native bindings for Python 0.25+ are often wrapped
      const nativeLang = (lang as any).language || lang;
      // tree-sitter 0.25's JS wrapper unmarshals nodes via `tree.language.nodeSubclasses`,
      // which is derived from nodeTypeInfo. Pass the FULL {language, nodeTypeInfo} object —
      // passing the raw `.language` pointer triggers "Cannot read properties of undefined
      // (reading '166')" on first node access. (The native bypass below still needs the raw pointer.)
      parser.setLanguage(lang);

      // 🛡️ [Conducks Sanity Check] 🧬
      // We perform a micro-parse to verify the native bridge is healthy.
      // This prevents 'reading 166' type crashes from bubbling up.
      const testTree = parser.parse(';');
      if (!testTree || !testTree.rootNode) {
        throw new Error('Native bridge returned invalid tree.');
      }
      
      return parser;
    } catch (err) {
      // 🛡️ [Ultimate Resilience Bridge] v3.0 🧬
      // High-stakes bypass: If the JS wrapper crashes (common in tree-sitter 0.25),
      // we extract the TRUE native setLanguage method and call it directly.
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
        console.error(`[Conducks Registry] Conducks Resilience: Native binding failure for ${langId}. Transitioning to Gnosis Fallback.`, err);
      }
      return undefined;
    }
  }

  /**
   * Whether a grammar was TRIED and could not be loaded — distinct from one nobody has asked for.
   * The difference decides whether a file degrades to the regex fallback or was never a candidate.
   */
  public isLanguageUnavailable(langId: string): boolean {
    return this.unavailableLanguages.has(langId);
  }

  /** A loaded grammar, or undefined. Undefined means not loaded YET, not unavailable — see above. */
  public getLanguage(langId: string): any | undefined {
    return this.languages.get(langId);
  }

  /**
   * Creates a structural query for a given language.
   *
   * Compiled queries are cached per (lang, source) pair — see `queryCache` above — because the
   * only caller compiles the same per-language constant once per FILE. Uncached, a 299-file
   * TypeScript pulse ran `new NativeParser.Query()` 299 times against identical arguments.
   */
  public createQuery(lang: any, source: string): any {
    const bySource = this.queryCache.get(lang);
    const cached = bySource?.get(source);
    if (cached) return cached;

    const nativeLang = (lang as any).language || lang;
    const NativeParser = this.loadNative();
    if (!NativeParser) return undefined;
    // 🛡️ [Conducks Resilience Bridge] v4.0
    // Parser.Query crashes with 'reading 166' on grammar ABI mismatches.
    // Bypass the JS wrapper and use the native binding directly.
    let query: any;
    try {
      query = new NativeParser.Query(nativeLang, source);
    } catch (err) {
      try {
        const tsPath = path.dirname(this.require.resolve('tree-sitter/package.json'));
        const binding = this.require('node-gyp-build')(tsPath);
        if (binding && binding.Query) {
          query = new binding.Query(nativeLang, source);
        } else {
          throw err;
        }
      } catch (bypassErr) {
        this.log(`[Conducks Registry] Query bypass failed:`, bypassErr);
        throw err;
      }
    }

    let cache = this.queryCache.get(lang);
    if (!cache) {
      cache = new Map();
      this.queryCache.set(lang, cache);
    }
    cache.set(source, query);
    return query;
  }



  /**
   * Hangs the grammar's `node-types.json` off the language object, so a query can be validated
   * against the node types that grammar really has rather than failing at match time (ADR 0089).
   */
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

  /** Grammar loading is the noisiest thing in a cold start, so it says nothing unless asked. */
  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}

export const grammars = GrammarRegistry.getInstance();
