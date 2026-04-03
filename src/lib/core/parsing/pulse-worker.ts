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

async function runWorker(data: any, isFork: boolean = false) {
  const { units, allPaths, discoveryMode, globalSymbols, resourceDir } = data;

  const reflector = new ConducksReflector();
  const context = new AnalyzeContext();
  
  // Conducks: Sync discovery mode and global symbols from parent
  if (discoveryMode) context.setDiscoveryMode(true);
  if (globalSymbols) {
    for (const [id, sym] of Object.entries(globalSymbols)) {
      context.registerGlobalSymbol(id, sym as any);
    }
  }

  // Structural Mapping: File Extension -> Provider
  const providers = new Map<string, any>([
    [".py", new PythonProvider()],
    [".ts", new TypeScriptProvider()],
    [".tsx", new TypeScriptProvider()],
    [".js", new TypeScriptProvider()],
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

  // Structural Mapping: File Extension -> Grammar Metadata
  const extensionToGrammar = new Map<string, { id: string, file: string }>([
    [".ts", { id: 'typescript', file: 'tree-sitter-typescript.wasm' }],
    [".tsx", { id: 'typescript', file: 'tree-sitter-typescript.wasm' }],
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
    const ext = path.extname(unit.path);
    const provider = providers.get(ext);
    if (!provider) continue;

    // Phase 1: Omni-Repo Native Grammar Induction 🛡️ 🔨
    const langId = provider.langId;
    if (langId && !loadedGrammars.has(langId)) {
      try {
        await grammars.loadLanguage(langId);
        loadedGrammars.add(langId);
      } catch (err) {
        results.push({ 
          path: unit.path, 
          error: `Native Grammar Induction Failed: ${(err as Error).message}`,
          success: false
        });
        continue;
      }
    }

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
      // Apostolic Resilience: Handle Degraded Induction (e.g. grammar mismatch)
      results.push({ 
        path: unit.path, 
        error: (err as Error).message,
        success: false
      });
    }
  }

  if (isFork) {
    process.send?.({ type: 'SUCCESS', results });
    process.exit(0);
  } else {
    parentPort?.postMessage(results);
  }
}

// Bootstrap Protocol: Fork vs Worker Detection 🏺
if (process.env.CONDUCKS_FORK_MODE === '1') {
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
