import * as Parser from "web-tree-sitter";
import { PrismSpectrum, SpectrumNode } from "@/lib/core/persistence/prism-core.js";
import { ConducksProvider } from "@/lib/core/parsing/providers/base.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { ImportProcessor } from "@/lib/core/parsing/processors/import.js";
import { BindingProcessor } from "@/lib/core/parsing/processors/binding.js";
import { CallProcessor } from "@/lib/core/parsing/processors/call.js";
import { HeritageProcessor } from "@/lib/core/parsing/processors/heritage.js";
import { FlowProcessor } from "@/lib/core/parsing/processors/flow.js";
import { PulseContext } from "@/lib/core/parsing/context.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/entropy.js";
import path from "node:path";


/**
 * Conducks — Structural Reflector (v5 Modular Evolution) 💎
 * 
 * The core engine that mirrors source code and delegates semantic
 * tasks to specialized processors.
 */
export class ConducksReflector {
  private imports = new ImportProcessor();
  private bindings = new BindingProcessor();
  private calls = new CallProcessor();
  private heritage = new HeritageProcessor();
  private flow = new FlowProcessor();

  /**
   * Reflects a file's structure into a Spectrum based on a Provider.
   */
  public async reflect(
    file: { path: string, source: string },
    provider: ConducksProvider,
    context: PulseContext,
    allPaths: string[]
  ): Promise<PrismSpectrum> {
    const spectrum: PrismSpectrum = {
      nodes: [],
      relationships: [],
      metadata: { language: provider.langId }
    };

    const isTestFile = file.path.includes("test_") || file.path.includes("/tests/") || file.path.includes(".test.");

    const lang = grammars.getLanguage(provider.langId);
    if (!lang) throw new Error(`[Conducks] Missing grammar: ${provider.langId}`);

    const parser = grammars.getUnifiedParser(provider.langId);
    if (!parser) throw new Error(`[Conducks] Engine failure for: ${provider.langId}`);

    const tree = parser.parse(file.source);
    const query = new (Parser as any).Query(lang, provider.queryScm);
    const matches = query.matches(tree.rootNode);

    const nodeCache = new Map<string, SpectrumNode>();

    // Conducks: Global Sentinel (Canonical File Anchor)
    nodeCache.set(`${file.path}::global`, {
      name: 'global',
      kind: 'module',
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: file.path,
      isExport: true,
      metadata: { isGlobalNode: true, isTest: isTestFile }
    });


    // Conducks.6: Clinical Scope Initialization
    context.clearLocalBindings();

    // === Pass 1: Build Node Cache & Scope Map ===
    // Map from source-row to enclosing scope name for correct call attribution
    type ScopeEntry = { name: string; startRow: number; endRow: number };
    const scopeMap: ScopeEntry[] = [];

    for (const match of matches) {
      // Conducks: Fix node identity resolution. 
      // Prioritize explicit name captures over structural kind captures.
      const nameCap = match.captures.find((c: any) => c.name === 'name' || c.name === 'pulse_assignment_name') ||
        match.captures.find((c: any) => c.name === 'isFunction' || c.name === 'isClass');

      if (!nameCap) continue;

      const name = nameCap.node.text;
      const nodeId = `${file.path}::${name}`;

      if (!nodeCache.has(nodeId)) {
        // Determine if this match is a function or class definition to capture full body range
        const isScoped = match.captures.some((c: any) => c.name === 'isFunction' || c.name === 'isClass');
        let rangeNode = nameCap.node;
        if (isScoped && nameCap.node.parent) {
          rangeNode = nameCap.node.parent;
        }

        nodeCache.set(nodeId, {
          name,
          kind: 'variable',
          range: {
            start: { line: rangeNode.startPosition.row + 1, column: rangeNode.startPosition.column },
            end: { line: rangeNode.endPosition.row + 1, column: rangeNode.endPosition.column }
          },
          filePath: file.path,
          isExport: true,
          metadata: { isTest: isTestFile }
        });

        if (isScoped && nameCap.node.parent) {
          scopeMap.push({ name, startRow: rangeNode.startPosition.row, endRow: rangeNode.endPosition.row });
        }
      }
    }

    // Helper: get enclosing scope name for a given row position
    const getScopeAt = (row: number, excludeName?: string): string => {
      // Find the innermost scope containing this row
      let best: ScopeEntry | undefined;
      for (const s of scopeMap) {
        if (excludeName && s.name === excludeName) continue;
        if (row >= s.startRow && row <= s.endRow) {
          if (!best || (s.endRow - s.startRow) < (best.endRow - best.startRow)) {
            best = s;
          }
        }
      }
      return best?.name ?? 'global';
    };

    // === Pass 2: Semantic Dispatch ===
    for (const match of matches) {
      const nameCap = match.captures.find((c: any) => c.name === 'name');
      const node = nameCap ? nodeCache.get(`${file.path}::${nameCap.node.text}`) : undefined;

      const captureMap: Record<string, string> = {};
      const args: string[] = [];

      match.captures.forEach((c: Parser.QueryCapture) => {
        captureMap[c.name] = c.node.text;
        if (c.name === 'kinesis_arg') args.push(c.node.text);
      });

      const captureRow = match.captures[0].node.startPosition.row;

      for (const capture of match.captures) {
        const cName = capture.name;
        const cText = capture.node.text;

        // 1. Definition Dispatch
        if (cName.startsWith('is')) {
          const kind = cName.slice(2).toLowerCase();
          
          // Conducks.6: Synchronized Import Binding (The Great Binding)
          if (kind === 'import') {
            const sourceCap = match.captures.find((c: any) => c.name === 'source');
            if (sourceCap) {
              const sourceText = sourceCap.node.text;
              const resolved = this.imports.resolve(sourceText, file.path, allPaths, provider, context);
              if (resolved) {
                // Register ALL named bindings in this match
                for (let i = 0; i < match.captures.length; i++) {
                  const cap = match.captures[i];
                  if (cap.name === 'name') {
                    const aliasCap = (i + 1 < match.captures.length && match.captures[i+1].name === 'alias') 
                      ? match.captures[i+1] : undefined;
                    this.imports.processBinding(resolved as string, cap.node.text, aliasCap ? aliasCap.node.text : cap.node.text, spectrum, context);
                  }
                }
                // Also process the file-level import edge
                this.imports.process(sourceText, file.path, allPaths, spectrum, provider, context);
              }
            }
          }

          if (node) {
            node.kind = kind as any;
            node.metadata[cName] = true;

            // Conducks: Structural Complexity Signal
            if (provider.calculateComplexity && (kind === 'function' || kind === 'method' || kind === 'class')) {
              const comp = provider.calculateComplexity(capture.node);
              node.metadata.complexity = comp;
              (node as any).complexity = comp; // For convenience during persistence
            }
          }
        }

        // 2. Semantic Dispatch
        else if (cName === 'heritage' && node) {
          this.heritage.process(cText, node.name, spectrum);
        }
        else if (cName === 'alias' && node) {
          this.bindings.processAlias(node.name, cText, spectrum);
        }
        else if (cName === 'kinesis_target' || cName === 'kinesis_qualified_target') {
          const scope = getScopeAt(captureRow);
          const type = this.calls.isConstructor(cText, provider) ? 'CONSTRUCTS' : 'CALLS';
          this.calls.process(cText, scope, type, spectrum, args, context);
        }


        // 3. Phase 2: Flow Dispatch
        else if (cName === 'pulse_assignment_name') {
          const val = captureMap['pulse_assignment_value'] ?? 'unknown';
          const scope = getScopeAt(captureRow);
          this.flow.processAssignment(cText, val, scope, spectrum);
        }
        else if (cName === 'kinesis_route') {
          const path = captureMap['kinesis_route_path'] ?? '/';
          const method = captureMap['route_method'] ?? 'GET';
          const scope = getScopeAt(captureRow);
          this.flow.processRoute(path, method, scope, spectrum, context.getFramework());
        }
        else if (cName === 'kinesis_request') {
          const url = captureMap['kinesis_request_url'] ?? '/';
          const method = captureMap['req_method'] ?? 'GET';
          const scope = getScopeAt(captureRow);
          this.flow.processRequest(url, method, scope, spectrum);
        }

        // 4. Phase 3.2: Debt Dispatch
        else if (cName === 'comment' && provider.extractDebt) {
          const markers = provider.extractDebt(capture.node);
          if (markers.length > 0) {
            const scope = getScopeAt(captureRow);
            const targetNode = nodeCache.get(`${file.path}::${scope}`);
            if (targetNode) {
              if (!targetNode.metadata.debtMarkers) targetNode.metadata.debtMarkers = [];
              targetNode.metadata.debtMarkers.push(...markers);
              (targetNode as any).debtMarkers = targetNode.metadata.debtMarkers;
            }
          }
        }
      }
    }


    spectrum.nodes = [...spectrum.nodes, ...nodeCache.values()];

    // Conducks.5: Structural Membership Binding (Parent -> Child)
    for (const node of nodeCache.values()) {
      if (node.name === 'global') continue;
      const scope = getScopeAt(node.range.start.line - 1, node.name);
      if (scope && scope !== 'global' && scope !== node.name) {
        spectrum.relationships.push({
          sourceName: scope,
          targetName: node.name,
          type: 'MEMBER_OF',
          confidence: 1.0
        });
      }
    }

    // Conducks: Ingest Kinetic Git Signals
    const resonance = await chronicle.getCommitResonance(file.path);
    const distribution = await chronicle.getAuthorDistribution(file.path);
    const blameData = await chronicle.getBlameData(file.path);
    const entropyRaw = calculateShannonEntropy(distribution);
    const entropyRisk = normalizeEntropyRisk(entropyRaw, Object.keys(distribution).length);
    const now = Math.floor(Date.now() / 1000);

    for (const n of spectrum.nodes) {
      // 1. File-level Kinetic Signals
      n.metadata.resonance = resonance.count;
      n.metadata.entropy = entropyRisk;
      (n as any).resonance = resonance.count;
      (n as any).entropy = entropyRisk;

      // 2. Symbol-level Blame Attribution
      const startLine = n.range.start.line;
      const endLine = n.range.end.line;
      const authors: Record<string, number> = {};
      let latestTime = 0;
      let earliestTime = now;

      for (let line = startLine; line <= endLine; line++) {
        const meta = blameData[line];
        if (meta) {
          authors[meta.author] = (authors[meta.author] || 0) + 1;
          if (meta.timestamp > latestTime) latestTime = meta.timestamp;
          if (meta.timestamp < earliestTime) earliestTime = meta.timestamp;
        }
      }

      const authorEntries = Object.entries(authors);
      if (authorEntries.length > 0) {
        authorEntries.sort((a, b) => b[1] - a[1]);
        const primary = authorEntries[0][0];
        const count = authorEntries.length;
        const tenure = Math.floor((now - earliestTime) / 86400);

        n.metadata.primaryAuthor = primary;
        n.metadata.authorCount = count;
        n.metadata.lastModified = latestTime;
        n.metadata.tenureDays = tenure > 0 ? tenure : 0;

        // Legacy/Aliased support for persistence
        (n as any).primaryAuthor = primary;
        (n as any).authorCount = count;
        (n as any).lastModified = latestTime;
        (n as any).tenureDays = n.metadata.tenureDays;
      }
    }

    // Seed Context for topological resolution
    spectrum.nodes.forEach(n => context.registerSymbol(`${file.path}::${n.name}`, n));
    spectrum.relationships.filter(r => r.type === 'IMPORTS').forEach(r => {
      context.registerImport(file.path, r.targetName);
    });

    return spectrum;
  }
}

