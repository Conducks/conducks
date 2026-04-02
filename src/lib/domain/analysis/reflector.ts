import * as Parser from "web-tree-sitter";
import { PrismSpectrum, SpectrumNode } from "@/lib/core/persistence/prism-core.js";
import { ConducksProvider } from "@/lib/core/parsing/providers/base.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { ImportProcessor } from "@/lib/core/parsing/processors/import.js";
import { BindingProcessor } from "@/lib/core/parsing/processors/binding.js";
import { CallProcessor } from "@/lib/core/parsing/processors/call.js";
import { HeritageProcessor } from "@/lib/core/parsing/processors/heritage.js";
import { FlowProcessor } from "@/lib/core/parsing/processors/flow.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/entropy.js";
import { mapToCanonical, CanonicalKind, CanonicalRank } from "@/lib/core/parsing/taxonomy.js";
import path from "node:path";


import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Structural Reflector
 */
export class ConducksReflector implements ConducksComponent {
  public readonly id = 'structural-reflector';
  public readonly type = 'analyzer';
  public readonly description = 'Analyzes source code units and reflects their structure into a Synapse graph.';
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
    context: AnalyzeContext,
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

    const fileMeta = mapToCanonical('file');
    const canonicalPath = file.path.toLowerCase();
    const fileId = `${canonicalPath}::unit`;
    const fileName = path.basename(file.path);
    
    nodeCache.set(fileId, {
      name: 'UNIT',
      kind: 'file' as any,
      canonicalKind: fileMeta.kind,
      canonicalRank: fileMeta.rank,
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: file.path,
      isExport: true,
      metadata: { 
        isGlobalNode: true, 
        isTest: isTestFile,
        displayName: path.basename(file.path),
        canonicalRank: 2,
        canonicalKind: 'UNIT'
      }
    });


    // Conducks.6: Clinical Scope Initialization
    context.clearLocalBindings();

    // === Pass 1: Build Scope Map ===
    type ScopeEntry = { name: string; startRow: number; endRow: number };
    const scopeMap: ScopeEntry[] = [];

    for (const match of matches) {
      const isScoped = match.captures.some((c: any) => 
        c.name === 'isFunction' || 
        c.name === 'isClass' || 
        c.name === 'isMethod' || 
        c.name === 'isInterface' || 
        c.name === 'isEnum'
      );
      if (isScoped) {
        const nameCap = match.captures.find((c: any) => c.name === 'name');
        if (nameCap && nameCap.node) {
          const name = nameCap.node.text;
          const rangeNode = nameCap.node.parent || nameCap.node;
          scopeMap.push({ 
            name, 
            startRow: rangeNode.startPosition.row, 
            endRow: rangeNode.endPosition.row 
          });
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
      return best ? best.name : '';
    };

    // === Pass 2: Semantic Pulse (Implementation & Binding) ===
    for (const match of matches) {
      if (!match || !match.captures) continue;

      const currentMatchRow = match.captures[0].node.startPosition.row;
      const matchNameCap = match.captures.find((c: any) => c.name === 'name' || c.name === 'pulse_assignment_name');
      
      let node: any;
      if (matchNameCap && matchNameCap.node) {
        const name = matchNameCap.node.text;
        const scope = getScopeAt(currentMatchRow, name);
        const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
        const scopedId = `${file.path.toLowerCase()}::${scopePrefix}${name.toLowerCase()}`;
        
        // Conducks.5: Identity Isolation (Lazy-init only for actual Definitions)
        const isDefinition = match.captures.some((c: any) => 
          c.name.startsWith('is') && 
          c.name !== 'isImport' && 
          c.name !== 'isExported'
        );

        if (isDefinition) {
           // Pass 1: Global Discovery
           if (context.isDiscoveryMode()) {
             context.registerGlobalSymbol(scopedId, { name, kind: 'unknown', filePath: file.path });
           }

           if (!nodeCache.has(scopedId)) {
             // Conducks: Dynamic Kind Resolution
             const defCapture = match.captures.find((c: any) => c.name.startsWith('is') && c.name !== 'isImport' && c.name !== 'isExported');
             let initialKind = defCapture ? defCapture.name.slice(2).toLowerCase() : 'variable';
             
             // Architectural Promotion: Elevate specific structural shapes to INFRA or ATOM
             if (initialKind === 'variable' && (name.endsWith('Service') || name.endsWith('Router') || name.endsWith('Controller'))) {
               initialKind = 'infra';
             }

             const isScoped = match.captures.some((c: any) => c.name === 'isFunction' || c.name === 'isClass' || c.name === 'isMethod');
             let rangeNode = matchNameCap.node;
             if (isScoped && matchNameCap.node.parent) {
               rangeNode = matchNameCap.node.parent;
             }

             const canonical = mapToCanonical(initialKind);
             nodeCache.set(scopedId, {
               name,
               kind: initialKind as any,
               canonicalKind: canonical.kind,
               canonicalRank: canonical.rank,
               range: {
                 start: { line: rangeNode.startPosition.row + 1, column: rangeNode.startPosition.column },
                 end: { line: rangeNode.endPosition.row + 1, column: rangeNode.endPosition.column }
               },
               filePath: file.path,
               isExport: false,
               metadata: { 
                 isTest: isTestFile, 
                 isExport: false,
                 canonicalKind: canonical.kind,
                 canonicalRank: canonical.rank
               }
             });
           }
        }
        node = nodeCache.get(scopedId);
      }

      // If we are only in Discovery Mode, we skip relationship establishment
      if (context.isDiscoveryMode()) continue;
      
      // Conducks.4: Identity Elevation - Capture export status from pass
      if (node && match.captures.some((c: any) => c.name === 'isExported')) {
        node.isExport = true;
        node.metadata.isExport = true;
      }

      const captureMap: Record<string, string> = {};
      const args: string[] = [];

      match.captures.forEach((c: Parser.QueryCapture) => {
        captureMap[c.name] = c.node.text;
        if (c.name === 'kinesis_arg') args.push(c.node.text);
      });

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
              const resolved = this.imports.resolve(sourceText, file.path.toLowerCase(), allPaths, provider, context);
              if (resolved) {
                // Register ALL named bindings in this match
                for (let i = 0; i < match.captures.length; i++) {
                  const cap = match.captures[i];
                  if (cap.name === 'name') {
                    const aliasCap = (i + 1 < match.captures.length && match.captures[i+1].name === 'alias') 
                      ? match.captures[i+1] : undefined;
                    const bindingName = cap.node.text.toLowerCase();
                    const aliasName = aliasCap ? aliasCap.node.text.toLowerCase() : bindingName;
                    this.imports.processBinding(resolved as string, bindingName, aliasName, spectrum, context);
                  }
                }
                // Also process the file-level import edge
                this.imports.process(sourceText, file.path.toLowerCase(), allPaths, spectrum, provider, context);
              }
            }
          }

          if (node) {
            node.kind = kind as any;
            node.metadata[cName] = true;
            
            // Conducks.4: Calibrate Canonical Taxonomy
            const canonical = mapToCanonical(kind);
            node.canonicalKind = canonical.kind;
            node.canonicalRank = canonical.rank;
            node.metadata.canonicalKind = canonical.kind;
            node.metadata.canonicalRank = canonical.rank;
            node.metadata.displayName = node.name; // Preserve for UI

            // Update Registry with the discovered kind for better resolution
            const scope = getScopeAt(currentMatchRow, node.name);
            const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
            const scopedId = `${file.path.toLowerCase()}::${scopePrefix}${node.name.toLowerCase()}`;
            const registryEntry = context.getGlobalSymbol(scopedId);
            if (registryEntry) registryEntry.kind = kind;

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
          const scope = getScopeAt(currentMatchRow);
          
          // Conducks.6: Qualified Resolve (Object.Property)
          let finalTarget = cText;
          if (captureMap['kinesis_object']) {
            finalTarget = `${captureMap['kinesis_object']}.${cText}`;
          }

          const type = this.calls.isConstructor(finalTarget, provider) ? 'CONSTRUCTS' : 'CALLS';
          this.calls.process(finalTarget, scope, type, spectrum, args, context);
        }


        // 3. Phase 2: Flow Dispatch
        else if (cName === 'pulse_assignment_name') {
          const val = captureMap['pulse_assignment_value'] ?? 'unknown';
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processAssignment(cText, val, scopeName, spectrum);
        }
        else if (cName === 'kinesis_route') {
          const path = captureMap['kinesis_route_path'] ?? '/';
          const method = captureMap['route_method'] ?? 'GET';
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processRoute(path, method, scopeName, spectrum, context.getFramework());

          // Conducks: Promote Logical Routes to Active Entry Points
          const scope = getScopeAt(currentMatchRow);
          const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
          const targetNode = nodeCache.get(`${file.path.toLowerCase()}::${scopePrefix}${scope ? scope.toLowerCase() : 'unit'}`);
          if (targetNode) {
            targetNode.metadata.isEntryPoint = true;
          }
        }
        else if (cName === 'kinesis_request') {
          const url = captureMap['kinesis_request_url'] ?? '/';
          const method = captureMap['req_method'] ?? 'GET';
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processRequest(url, method, scopeName, spectrum);
        }
        else if (cName === 'pulse_type_target') {
          const scope = getScopeAt(currentMatchRow);
          this.calls.process(cText, scope, 'TYPE_REFERENCE', spectrum, [], context);
        }

        // 4. Phase 3.2: Debt Dispatch
        else if (cName === 'comment' && provider.extractDebt) {
          const markers = provider.extractDebt(capture.node);
          if (markers.length > 0) {
            const scopeName = getScopeAt(currentMatchRow);
            const scopePrefix = scopeName ? `${scopeName.toLowerCase()}.` : '';
            const targetId = `${file.path.toLowerCase()}::${scopePrefix}${scopeName ? scopeName.toLowerCase() : 'unit'}`;
            const targetNode = nodeCache.get(targetId);
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
    if (!context.isDiscoveryMode()) {
      const fileAnchorName = path.basename(file.path);
      for (const node of nodeCache.values()) {
        if (node.name === fileAnchorName || node.name === 'UNIT') continue;
        const scope = getScopeAt(node.range.start.line - 1, node.name);
        
        // Conducks: Hierarchical Unification (L2-L7 Parentage)
        spectrum.relationships.push({
          sourceName: scope || 'unit',
          targetName: node.name,
          type: 'MEMBER_OF',
          confidence: 1.0
        });
      }
    }

    // Conducks: Ingest Kinetic Git Signals (Only in Resolution Mode)
    if (!context.isDiscoveryMode()) {
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
    }

    // Seed Import Map (Only in Discovery Mode)
    if (context.isDiscoveryMode()) {
       spectrum.relationships.filter(r => r.type === 'IMPORTS').forEach(r => {
         context.registerImport(file.path.toLowerCase(), r.targetName.toLowerCase());
       });
    }

    return spectrum;
  }
}
