import * as Parser from "web-tree-sitter";
import { PrismSpectrum, SpectrumNode } from "./prism-core.js";
import { ApostleProvider } from "./providers/base.js";
import { grammars } from "../../core/parser/grammar-registry.js";
import { ImportProcessor } from "./processors/import.js";
import { BindingProcessor } from "./processors/binding.js";
import { CallProcessor } from "./processors/call.js";
import { HeritageProcessor } from "./processors/heritage.js";
import { FlowProcessor } from "./processors/flow.js";
import { PulseContext } from "./context.js";


/**
 * Apostle — Structural Reflector (v5 Modular Evolution) 💎
 * 
 * The core engine that mirrors source code and delegates semantic
 * tasks to specialized processors.
 */
export class ApostleReflector {
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
    provider: ApostleProvider,
    context: PulseContext,
    allPaths: string[]
  ): Promise<PrismSpectrum> {
    const spectrum: PrismSpectrum = {
      nodes: [],
      relationships: [],
      metadata: { language: provider.langId }
    };

    const lang = grammars.getLanguage(provider.langId);
    if (!lang) throw new Error(`[Apostle] Missing grammar: ${provider.langId}`);

    const parser = grammars.getUnifiedParser(provider.langId);
    if (!parser) throw new Error(`[Apostle] Engine failure for: ${provider.langId}`);

    const tree = parser.parse(file.source);
    const query = new (Parser as any).Query(lang, provider.queryScm);
    const matches = query.matches(tree.rootNode);

    const nodeCache = new Map<string, SpectrumNode>();

    // Apostle v6: Global Sentinel (Canonical File Anchor)
    nodeCache.set(`${file.path}::global`, {
      name: 'global',
      kind: 'module',
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: file.path,
      isExport: true,
      metadata: { isGlobalNode: true }
    });


    // === Pass 1: Build Node Cache & Scope Map ===
    // Map from source-row to enclosing scope name for correct call attribution
    type ScopeEntry = { name: string; startRow: number; endRow: number };
    const scopeMap: ScopeEntry[] = [];

    for (const match of matches) {
      const nameCap = match.captures.find((c: any) => 
        c.name === 'name' || 
        c.name === 'isFunction' || 
        c.name === 'isClass' || 
        c.name === 'pulse_assignment_name'
      );
      if (!nameCap) continue;
      
      const name = nameCap.node.text;
      const nodeId = `${file.path}::${name}`;
      
      if (!nodeCache.has(nodeId)) {
        nodeCache.set(nodeId, {
          name,
          kind: 'variable',
          range: {
            start: { line: nameCap.node.startPosition.row + 1, column: nameCap.node.startPosition.column },
            end: { line: nameCap.node.endPosition.row + 1, column: nameCap.node.endPosition.column }
          },
          filePath: file.path,
          isExport: true,
          metadata: {}
        });
      }

      // Determine if this match is a function or class definition to build scope map
      const isScoped = match.captures.some((c: any) => c.name === 'isFunction' || c.name === 'isClass');
      if (isScoped) {
        const bodyNode = nameCap.node.parent;
        if (bodyNode) {
          scopeMap.push({ name, startRow: bodyNode.startPosition.row, endRow: bodyNode.endPosition.row });
        }
      }
    }

    // Helper: get enclosing scope name for a given row position
    const getScopeAt = (row: number): string => {
      // Find the innermost scope containing this row
      let best: ScopeEntry | undefined;
      for (const s of scopeMap) {
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
          if (node) {
            node.kind = kind as any;
            node.metadata[cName] = true;
          }
          if (cName === 'isImport') {
            this.imports.process(cText, file.path, allPaths, spectrum, provider);
            if (provider.extractNamedBindings) {
               const bindings = provider.extractNamedBindings(capture.node.parent ?? capture.node);
               bindings.forEach(b => this.bindings.processAlias(b.name, b.alias ?? b.name, spectrum));
            }
          }
        }

        // 2. Semantic Dispatch
        else if (cName === 'source') {
          this.imports.process(cText, file.path, allPaths, spectrum, provider);
        }
        else if (cName === 'heritage' && node) {
          this.heritage.process(cText, node.name, spectrum);
        }
        else if (cName === 'alias' && node) {
          this.bindings.processAlias(node.name, cText, spectrum);
        }
        else if (cName === 'kinesis_target' || cName === 'kinesis_qualified_target') {
          const scope = getScopeAt(captureRow);
          const type = this.calls.isConstructor(cText, provider) ? 'CONSTRUCTS' : 'CALLS';
          this.calls.process(cText, scope, type, spectrum, args);
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
           this.flow.processRoute(path, method, scope, spectrum);
        }
        else if (cName === 'kinesis_request') {
           const url = captureMap['kinesis_request_url'] ?? '/';
           const method = captureMap['req_method'] ?? 'GET';
           const scope = getScopeAt(captureRow);
           this.flow.processRequest(url, method, scope, spectrum);
        }
      }
    }


    spectrum.nodes = [...spectrum.nodes, ...nodeCache.values()];
    
    // Seed Context for topological resolution
    spectrum.nodes.forEach(n => context.registerSymbol(`${file.path}::${n.name}`, n));
    spectrum.relationships.filter(r => r.type === 'IMPORTS').forEach(r => {
      context.registerImport(file.path, r.targetName);
    });

    return spectrum;
  }
}

