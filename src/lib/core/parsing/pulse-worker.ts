import { parentPort, workerData } from 'node:worker_threads';
import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { grammars } from "./grammar-registry.js";
import { PythonProvider } from "@/lib/core/parsing/languages/python/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/languages/typescript/index.js";
import { GoProvider } from "@/lib/core/parsing/languages/go/index.js";
import { RustProvider } from "@/lib/core/parsing/languages/rust/index.js";
import { JavaProvider } from "@/lib/core/parsing/languages/java/index.js";
import { CSharpProvider } from "@/lib/core/parsing/languages/csharp/index.js";
import { CPPProvider } from "@/lib/core/parsing/languages/cpp/index.js";
import { PHPProvider } from "@/lib/core/parsing/languages/php/index.js";
import { RubyProvider } from "@/lib/core/parsing/languages/ruby/index.js";
import { SwiftProvider } from "@/lib/core/parsing/languages/swift/index.js";
import { CProvider } from "@/lib/core/parsing/languages/c/index.js";
import path from 'node:path';
import fs from 'node:fs';

/**
 * Conducks — Generalized Pulse Worker 💎 🐍 🟦
 * 
 * High-performance structural reflection off-thread.
 */

async function runWorker() {
  const { units, allPaths, discoveryMode, globalSymbols, resourceDir } = workerData;

  // Primal Bootstrapping: Load Polyglot Grammars
  if (resourceDir) {
    await grammars.init({ resourceDir });
    const log = (...args: any[]) => {
      if (process.env.CONDUCKS_DEBUG === '1') console.error(`[Worker ${process.pid}]`, ...args);
    };

    log(`Initializing structural engine with resourceDir: ${resourceDir}`);

    const languages = [
      { id: 'typescript', file: 'tree-sitter-typescript.wasm' },
      { id: 'python', file: 'tree-sitter-python.wasm' },
      { id: 'go', file: 'tree-sitter-go.wasm' },
      { id: 'rust', file: 'tree-sitter-rust.wasm' },
      { id: 'java', file: 'tree-sitter-java.wasm' },
      { id: 'csharp', file: 'tree-sitter-csharp.wasm' },
      { id: 'cpp', file: 'tree-sitter-cpp.wasm' },
      { id: 'php', file: 'tree-sitter-php.wasm' },
      { id: 'ruby', file: 'tree-sitter-ruby.wasm' },
      { id: 'swift', file: 'tree-sitter-swift.wasm' },
      { id: 'c', file: 'tree-sitter-c.wasm' },
      { id: 'javascript', file: 'tree-sitter-javascript.wasm' }
    ];

    for (const lang of languages) {
      const wasmPath = path.join(resourceDir, lang.file);
      await grammars.loadLanguage(lang.id, wasmPath);
      const isLoaded = !!grammars.getLanguage(lang.id);
      log(`Grammar status: ${lang.id} -> ${isLoaded ? 'LOADED' : 'FAILED'}`);
      
      if (!isLoaded) {
        fs.appendFileSync('/tmp/conducks_pulse_debug.txt', `[Worker ${process.pid}] FAILED to load ${lang.id} from ${wasmPath}\n`);
      }
    }
  }
  const reflector = new ConducksReflector();
  const context = new AnalyzeContext();
  
  // Conducks: Sync discovery mode and global symbols from parent
  if (discoveryMode) context.setDiscoveryMode(true);
  if (globalSymbols) {
    for (const [id, sym] of Object.entries(globalSymbols)) {
      context.registerGlobalSymbol(id, sym as any);
    }
  }

  const providers = new Map<string, any>([
    [".py", new PythonProvider()],
    [".ts", new TypeScriptProvider()],
    [".tsx", new TypeScriptProvider()],
    [".js", new TypeScriptProvider()], // Falls back to TS provider for now if no specific JS logic
    [".jsx", new TypeScriptProvider()],
    [".go", new GoProvider()],
    [".rs", new RustProvider()],
    [".java", new JavaProvider()],
    [".cs", new CSharpProvider()],
    [".cpp", new CPPProvider()],
    [".h", new CPPProvider()],
    [".hpp", new CPPProvider()],
    [".cc", new CPPProvider()],
    [".php", new PHPProvider()],
    [".rb", new RubyProvider()],
    [".rake", new RubyProvider()],
    [".swift", new SwiftProvider()],
    [".c", new CProvider()]
  ]);

  const results = [];

  for (const unit of units) {
    const ext = path.extname(unit.path);
    const provider = providers.get(ext);
    if (!provider) continue;

    try {
      const spectrum = await reflector.reflect(unit, provider, context, allPaths);
      
      // Return captured state for worker-to-main reduction
      const state = context.exportState();

      results.push({ 
        path: unit.path, 
        spectrum,
        state,
        success: true 
      });
    } catch (err) {
      results.push({ 
        path: unit.path, 
        error: (err as Error).message,
        success: false
      });
    }
  }

  parentPort?.postMessage(results);
}

runWorker().catch(err => {
  console.error(`[Conducks Pulse Worker] Fatal Error:`, err);
  process.exit(1);
});
