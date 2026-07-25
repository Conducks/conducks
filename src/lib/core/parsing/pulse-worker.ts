import { parentPort, workerData } from 'node:worker_threads';
import { AnalyzeContext } from "./context.js";
import { grammars } from "./grammar-registry.js";
import { PythonProvider } from "./languages/python/index.js";
import { TypeScriptProvider } from "./languages/typescript/index.js";
import { TSXProvider } from "./languages/tsx/index.js";
import { JavaScriptProvider } from "./languages/javascript/index.js";
import { GoProvider } from "./languages/go/index.js";
import { RustProvider } from "./languages/rust/index.js";
import { JavaProvider } from "./languages/java/index.js";
import { CSharpProvider } from "./languages/csharp/index.js";
import { CPPProvider } from "./languages/cpp/index.js";
import { PHPProvider } from "./languages/php/index.js";
import { RubyProvider } from "./languages/ruby/index.js";
import { SwiftProvider } from "./languages/swift/index.js";
import { CProvider } from "./languages/c/index.js";
import path from 'node:path';
import fs from 'node:fs';

/**
 * Conducks — Pulse Worker 🛡️ 🧬 🏎️
 * 
 * High-performance structural induction worker thread.
 */

async function runWorker(data: any, isFork: boolean = false, isSpawn: boolean = false) {
  const { units, allPaths, discoveryMode, globalSymbols, resourceDir } = data;

  // The reflector lives in the DOMAIN layer; this worker is in CORE. A static import would be a
  // core → domain edge (ADR 0005). This file is a process entry point, not a core primitive — it is
  // spawned standalone (worker / fork / spawn) so the reflector cannot be constructor-injected
  // across the process boundary. Loading it lazily keeps the dependency dynamic: nothing in core
  // pulls domain at module-resolution time, and the worker still gets the real reflector on its
  // first (and only) call. Behaviourally identical — runWorker is invoked immediately at bootstrap.
  const { ConducksReflector } = await import("../../domain/analysis/reflector.js");
  const reflector = new ConducksReflector();
  const context = new AnalyzeContext();
  
  // Conducks: Sync discovery mode and global symbols from parent
  if (discoveryMode) context.setDiscoveryMode(true);
  if (globalSymbols) {
    for (const [id, sym] of Object.entries(globalSymbols)) {
      context.registerGlobalSymbol(id, sym as any);
    }
  }

  const cppProvider = new CPPProvider();
  const cProvider = new CProvider();

  function isCppHeader(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
      return /\bclass\b|\btemplate\s*<|\bnamespace\b|::/.test(content);
    } catch {
      return false;
    }
  }

  // Structural Mapping: File Extension -> Provider.
  // DERIVED from each provider's own `extensions` array (CONDUCKS-2 guarantees the field) — the
  // hand-written map this replaces had to be kept in sync with the providers by hand and drifted
  // (CPPProvider declares .cxx/.hxx; neither was ever registered here or in src/registry, so those
  // files were found by discovery and then dispatched to nothing).
  // List order = precedence, LAST claim wins: JavaScriptProvider comes after TypeScriptProvider so
  // .js/.jsx keep the JavaScript provider (TypeScriptProvider also declares both), and cProvider
  // comes after cppProvider so .h resolves to C — irrelevant in practice because .h is decided by
  // the isCppHeader() content sniff before this map is consulted.
  const providerPrecedence = [
    new PythonProvider(),
    new TypeScriptProvider(),
    new TSXProvider(),
    new JavaScriptProvider(),
    new GoProvider(),
    new RustProvider(),
    new JavaProvider(),
    new CSharpProvider(),
    cppProvider,
    new PHPProvider(),
    new RubyProvider(),
    new SwiftProvider(),
    cProvider
  ];
  const providers = new Map<string, any>();
  for (const provider of providerPrecedence) {
    // Lookup here is by path.extname, so only dot patterns are dispatchable (Ruby's bare
    // 'Rakefile'/'Gemfile' claims are filename patterns and belong to the registry's filename map).
    for (const pattern of ((provider as any).extensions ?? []) as string[]) {
      if (pattern.startsWith('.')) providers.set(pattern, provider);
    }
  }

  // Structural Mapping: File Extension -> Grammar Metadata
  const extensionToGrammar = new Map<string, { id: string, file: string }>([
    [".ts", { id: 'typescript', file: 'tree-sitter-typescript.wasm' }],
    [".tsx", { id: 'tsx', file: 'tree-sitter-tsx.wasm' }],
    [".js", { id: 'javascript', file: 'tree-sitter-javascript.wasm' }],
    [".jsx", { id: 'javascript', file: 'tree-sitter-javascript.wasm' }],
    [".py", { id: 'python', file: 'tree-sitter-python.wasm' }],
    [".go", { id: 'go', file: 'tree-sitter-go.wasm' }],
    [".rs", { id: 'rust', file: 'tree-sitter-rust.wasm' }],
    [".java", { id: 'java', file: 'tree-sitter-java.wasm' }],
    [".cs", { id: 'csharp', file: 'tree-sitter-csharp.wasm' }],
    [".cpp", { id: 'cpp', file: 'tree-sitter-cpp.wasm' }],
    [".hpp", { id: 'cpp', file: 'tree-sitter-cpp.wasm' }],
    [".cc", { id: 'cpp', file: 'tree-sitter-cpp.wasm' }],
    [".h", { id: 'cpp', file: 'tree-sitter-cpp.wasm' }],
    [".php", { id: 'php', file: 'tree-sitter-php.wasm' }],
    [".rb", { id: 'ruby', file: 'tree-sitter-ruby.wasm' }],
    [".rake", { id: 'ruby', file: 'tree-sitter-ruby.wasm' }],
    [".swift", { id: 'swift', file: 'tree-sitter-swift.wasm' }],
    [".c", { id: 'c', file: 'tree-sitter-c.wasm' }]
  ]);

  const results = [];
  const loadedGrammars = new Set<string>();

  for (const unit of units) {
    try {
      const ext = path.extname(unit.path);
      const provider = ext === '.h' ? (isCppHeader(unit.path) ? cppProvider : cProvider) : providers.get(ext);
      if (!provider) continue;

      // Phase 1: Omni-Repo Native Grammar Induction 🛡️ 🔨
      const langId = provider.langId;
      if (langId && !loadedGrammars.has(langId)) {
        await grammars.loadLanguage(langId);
        loadedGrammars.add(langId);
      }

      const spectrum = await reflector.reflect(
        { path: unit.path, source: fs.readFileSync(unit.path, 'utf8') },
        provider,
        context,
        allPaths
      );

      results.push({ 
        path: unit.path, 
        spectrum, 
        success: true 
      });
    } catch (err) {
      // Conducks Resilience: Handle Degraded Induction (e.g. grammar mismatch)
      results.push({ 
        path: unit.path, 
        error: (err as Error).message,
        success: false
      });
    }
  }

  if (isSpawn) {
    return results;
  } else if (isFork) {
    process.send?.({ type: 'SUCCESS', results });
    process.exit(0);
  } else {
    parentPort?.postMessage(results);
  }
  return results;
}

// Bootstrap Protocol: Worker vs Spawn vs Fork Detection 🏺
if (process.env.CONDUCKS_WORKER_MODE === 'spawn') {
  try {
    const inputPath = process.argv[2];
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const results = await runWorker(data, false, true);
    if (data.tempOutputFile) {
      const payload = results && Array.isArray(results) ? results : [];
      fs.writeFileSync(data.tempOutputFile, JSON.stringify(payload));
    }
    process.exit(0);
    } catch (e: any) {
      console.error(`🛡️ [Conducks Synapse] Persistence Failure during flush:`, e.message);
    process.exit(1);
  }
} else if (process.env.CONDUCKS_FORK_MODE === '1') {
  process.on('message', async (msg: any) => {
    if (msg.type === 'START') {
      try {
        await runWorker(msg.data, true);
      } catch (err) {
        process.send?.({ type: 'ERROR', error: (err as Error).message });
        process.exit(1);
      }
    }
  });
} else {
  runWorker(workerData).catch(err => {
    console.error(`[Conducks Pulse Worker] Fatal Error:`, err);
    process.exit(1);
  });
}
