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
  const { units, allPaths, discoveryMode, globalSymbols, externalPackages } = data;

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
  // Without these the resolver's external-package check is dead inside the subprocess, and a bare
  // specifier falls through to the basename fallback — which is how `next/headers` came to point at
  // the project's own `headers.ts`.
  for (const pkg of (externalPackages ?? []) as string[]) context.registerExternalPackage(pkg);

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


  const results = [];
  const loadedGrammars = new Set<string>();

  for (const unit of units) {
    try {
      const ext = path.extname(unit.path);
      const provider = ext === '.h' ? (isCppHeader(unit.path) ? cppProvider : cProvider) : providers.get(ext);
      if (!provider) {
        // REPORTED, not skipped in silence (ADR 0049, its open question answered).
        //
        // This used to `continue`, so a file with no language provider produced no result at all —
        // and the caller could not tell "we chose not to parse this" from "this vanished". That is
        // the same conflation the rest of ADR 0049 closes one layer up, and it surfaced the moment
        // the orchestrator started counting: a fixture with `package.json` and `go.mod` aborted the
        // pulse, because manifests are handled by EssenceLens rather than by a grammar and were
        // therefore legitimately absent.
        //
        // Answering the open question with the measurement it asked for: on a polyglot fixture the
        // skipped set is manifests and other non-code files, which is uninteresting per file and
        // load-bearing in aggregate — the count has to reconcile, so the skip has to be visible.
        results.push({ path: unit.path, success: false, skipped: true, reason: `no language provider for ${ext || 'this file'}` });
        continue;
      }

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
    console.error(`🛡️ [Conducks Synapse] Worker failure:`, e.message);
    // Exiting non-zero is now enough on its own — the parent inspects status (ADR 0049). Before
    // that, this path exited without writing tempOutputFile, and the parent read a MISSING file as
    // an empty result: a crash and a chunk with no symbols were indistinguishable.
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
