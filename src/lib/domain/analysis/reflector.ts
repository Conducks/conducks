import Parser from "tree-sitter";
import { PrismSpectrum, SpectrumNode } from "../../core/parsing/prism-core.js";
import { ConducksProvider } from "../../core/parsing/providers/base.js";
import { grammars } from "../../core/parsing/grammar-registry.js";
import { ImportProcessor } from "../../core/parsing/processors/import.js";
import { classifyOrigin } from "../../core/graph/boundary-classifier.js";
import { BindingProcessor } from "../../core/parsing/processors/binding.js";
import { CallProcessor } from "../../core/parsing/processors/call.js";
import { HeritageProcessor } from "../../core/parsing/processors/heritage.js";
import { FlowProcessor } from "../../core/parsing/processors/flow.js";
import { AnalyzeContext } from "../../core/parsing/context.js";
import { chronicle } from "../../core/git/chronicle-interface.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "../../core/algorithms/entropy.js";
import { mapToCanonical, CanonicalKind, CanonicalRank } from "../../core/parsing/taxonomy.js";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

import { ConducksComponent } from "../../../contracts/types.js";
import { CaptureTags, DEFINITION_CAPTURES } from "../../../types/capture-tags.js";

/**
 * Conducks — Structural Reflector
 * 
 * Orchestrates the induction wave and ensures the synapse resonance
 * is broadcast to the Mirror visual interface.
 */
export class ConducksReflector implements ConducksComponent {
  public id = 'structural-reflector';
  public type = 'analyzer' as any;
  public description = 'Analyzes source code units and reflects their structure into a Synapse graph.';
  public readonly imports = new ImportProcessor();
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

    const isTestFile = (() => {
      const lowerPath = file.path.toLowerCase();
      const fileName = lowerPath.split('/').pop() || '';
      return (
        fileName.startsWith('test_') ||
        fileName.endsWith('_test.go') ||
        fileName.endsWith('_test.rs') ||
        fileName.endsWith('_test.py') ||
        fileName.endsWith('_spec.rb') ||
        fileName.endsWith('tests.swift') ||
        fileName.endsWith('.test.ts') ||
        fileName.endsWith('.test.js') ||
        fileName.endsWith('.spec.ts') ||
        fileName.endsWith('.spec.js') ||
        /^test/.test(fileName) ||
        lowerPath.includes('/tests/') ||
        lowerPath.includes('/__tests__/') ||
        lowerPath.includes('/spec/') ||
        lowerPath.includes('/test/')
      );
    })();

    const fileMeta = mapToCanonical('file');
    const canonicalPath = file.path.toLowerCase();
    const projectRoot = chronicle.getProjectDir()?.toLowerCase() || '';
    const relativePath = path.relative(projectRoot, file.path).toLowerCase();

    // Namespace calculation
    const rootName = path.basename(projectRoot).toLowerCase();
    const namespacePath = path.dirname(relativePath);
    const namespaceId = namespacePath === '.' ? `repository::${rootName}` : `directory::${path.join(projectRoot, namespacePath).toLowerCase()}`;

    const fileId = `${canonicalPath}::unit`;
    // A file's span runs from line 1 to its last line, so UNIT nodes carry a
    // real range for "% of file activated by coverage" instead of lineEnd=0.
    const fileLineCount = file.source.split('\n').length;
    const unitNode: SpectrumNode = {
      name: path.basename(file.path),
      kind: 'file' as any,
      canonicalKind: fileMeta.kind,
      canonicalRank: fileMeta.rank, // Rank 3
      range: { start: { line: 1, column: 0 }, end: { line: fileLineCount, column: 0 } },
      filePath: file.path,
      isExport: true,
      properties: {
        // persistence.ts derives lineStart/lineEnd from node.properties.range,
        // not the top-level `range` field — mirror it here or UNIT rows persist lineEnd=0.
        range: { start: { line: 1, column: 0 }, end: { line: fileLineCount, column: 0 } }
      },
      metadata: {
        id: fileId,
        isGlobalNode: true,
        isTest: isTestFile,
        displayName: path.basename(file.path),
        canonicalRank: fileMeta.rank,
        canonicalKind: 'UNIT',
        unitId: fileId,
        namespaceId: namespaceId,
        rootId: `repository::${rootName}`,
        layer_path: relativePath,
        depth: 3
      }
    } as any;

    const parser = grammars.getUnifiedParser(provider.langId);

    if (!parser) {
      return this.reflectGnosis(file, provider, context);
    }

    const lang = grammars.getLanguage(provider.langId);
    if (!lang) throw new Error(`[Conducks] Missing native grammar: ${provider.langId}`);

    let tree: any;
    try {
      // tree-sitter's Node binding defaults to a 32KB parse buffer and throws
      // "Invalid argument" on larger inputs. Size the buffer to the source so
      // big files parse natively instead of falling back to the edge-less
      // Gnosis extractor (which would make their symbols look orphaned).
      const byteLen = Buffer.byteLength(file.source, 'utf8');
      const bufferSize = byteLen > 31 * 1024 ? byteLen * 2 + 1024 : undefined;
      tree = bufferSize ? parser.parse(file.source, undefined, { bufferSize }) : parser.parse(file.source);
    } catch (err) {
      if (process.env.CONDUCKS_DEBUG === '1') {
        console.error(`🛡️ [Conducks Reflector] Native Parse Crash: ${file.path}. Falling back to Gnosis.`, err);
      }
      return this.reflectGnosis(file, provider, context);
    }

    let query: any;
    try {
      const lang = grammars.getLanguage(provider.langId);
      if (!lang) return this.reflectGnosis(file, provider, context);
      query = grammars.createQuery(lang, provider.queryScm);

    } catch (err) {
      if (process.env.CONDUCKS_DEBUG === '1') {
        console.error(`🛡️ [Conducks Reflector] Native Query Creation Failure: ${file.path}. Falling back to Gnosis.`, err);
      }
      return this.reflectGnosis(file, provider, context);
    }
    
    if (!query) return this.reflectGnosis(file, provider, context);

    let matches = [];
    try {
      matches = query.matches(tree.rootNode);
    } catch (err) {
      if (process.env.CONDUCKS_DEBUG === '1') {
        console.error(`🛡️ [Conducks Reflector] Native Query Crash: ${file.path}. Falling back to Gnosis.`, err);
      }
      return this.reflectGnosis(file, provider, context);
    }
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.log(`🛡️ [Reflector] ${path.basename(file.path)} matches: ${matches.length}`);
    }

    const nodeCache = new Map<string, SpectrumNode>();

    nodeCache.set(fileId, unitNode);

    context.clearLocalBindings();

    // === Pass 1: Build Scope Map ===
    type ScopeEntry = { name: string; startRow: number; endRow: number };
    const scopeMap: ScopeEntry[] = [];

    for (const match of matches) {
      const isScoped = match.captures.some((c: any) =>
        c.name === CaptureTags.IS_FUNCTION ||
        c.name === CaptureTags.IS_CLASS ||
        c.name === CaptureTags.IS_STRUCT ||
        c.name === CaptureTags.IS_METHOD ||
        c.name === CaptureTags.IS_INTERFACE ||
        c.name === CaptureTags.IS_INFRA ||
        c.name === CaptureTags.IS_ENUM
      );
      if (isScoped) {
        const nameCap = match.captures.find((c: any) => c.name === CaptureTags.NAME);
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

    const getScopeAt = (row: number, excludeName?: string): string => {
      // Find all scopes that organically encapsulate the row
      const enclosing = scopeMap.filter(s => {
        if (excludeName && s.name === excludeName) return false;
        return row >= s.startRow && row <= s.endRow;
      });

      // Sort by absolute encapsulation (largest container first)
      enclosing.sort((a, b) => {
        if (a.startRow !== b.startRow) return a.startRow - b.startRow;
        return b.endRow - a.endRow;
      });

      const names: string[] = [];
      for (const s of enclosing) {
        if (!names.includes(s.name)) names.push(s.name);
      }

      return names.join('.');
    };

    // === Pass 2: Semantic Pulse ===
    // Reference-as-value candidates: bare identifiers passed as call arguments (callbacks, DI-table
    // values). Collected here, resolved AFTER the match loop — tree-sitter match order is NOT source
    // order, so gating on nodeCache mid-loop would miss a use that precedes its definition.
    const refValueCandidates: Array<{ scope: string; name: string; raw: string }> = [];
    for (const match of matches) {
      if (!match || !match.captures || match.captures.length === 0) continue;

      const firstCapture = match.captures[0];
      if (!firstCapture || !firstCapture.node) continue;

      const currentMatchRow = firstCapture.node.startPosition.row;
      const matchNameCap = match.captures.find((c: any) => c.name === CaptureTags.NAME || c.name === 'pulse_assignment_name');

      let node: any;
      if (matchNameCap && matchNameCap.node) {
        const name = matchNameCap.node.text;
        const scope = getScopeAt(currentMatchRow, name);
        const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
        const scopedId = `${file.path.toLowerCase()}::${scopePrefix}${name.toLowerCase()}`;
        

        const isDefinition = match.captures.some((c: any) => DEFINITION_CAPTURES.has(c.name));

        if (isDefinition) {
          if (context.isDiscoveryMode()) {
            context.registerGlobalSymbol(scopedId, { name, kind: 'unknown', filePath: file.path });
          }

          if (!nodeCache.has(scopedId)) {
            const defCapture = match.captures.find((c: any) => DEFINITION_CAPTURES.has(c.name));
            let initialKind = defCapture ? defCapture.name.slice(2).toLowerCase() : 'variable';

            const infraSuffixes = ['Service', 'Router', 'Controller', 'Registry', 'Store', 'Runner', 'Manager', 'Engine', 'Writer', 'Reporter', 'Provider', 'Client'];
            if (infraSuffixes.some(s => name.endsWith(s))) {
              initialKind = 'infra';
            }

            // IS_INFRA included so multi-line infra (decorators, providers) get a real span.
            // Note: single-line @isInfra hook patterns (useState/useEffect array_pattern) still
            // collapse to ~1 line — resolving those needs a variable_declarator walk (deferred, low value).
            const isScoped = match.captures.some((c: any) => c.name === CaptureTags.IS_FUNCTION || c.name === CaptureTags.IS_CLASS || c.name === CaptureTags.IS_STRUCT || c.name === CaptureTags.IS_METHOD || c.name === CaptureTags.IS_INTERFACE || c.name === CaptureTags.IS_ENUM || c.name === CaptureTags.IS_INFRA);
            let rangeNode = matchNameCap.node;
            if (isScoped && matchNameCap.node.parent) {
              rangeNode = matchNameCap.node.parent;
            }

            const canonical = mapToCanonical(initialKind);
            const parentScopeName = getScopeAt(currentMatchRow, name);
            const parentScopePrefix = parentScopeName ? `${parentScopeName.toLowerCase()}.` : '';
            const parentId = parentScopeName
              ? `${file.path.toLowerCase()}::${parentScopePrefix.toLowerCase()}`.slice(0, -1)
              : fileId;

            const dna = {
              isAsync: match.captures.some((c: any) => c.name === CaptureTags.IS_ASYNC),
              isAbstract: match.captures.some((c: any) => c.name === CaptureTags.IS_ABSTRACT),
              isExported: match.captures.some((c: any) => c.name === CaptureTags.IS_EXPORTED),
              isStatic: match.captures.some((c: any) => c.name === CaptureTags.IS_STATIC),
              params: [],
              returns: 'void'
            };

            const fingerprint = crypto.createHash('sha256').update(`${file.path}|${name}|${JSON.stringify(dna)}`).digest('hex');

            nodeCache.set(scopedId, {
              name,
              kind: initialKind as any,
              canonicalKind: canonical.kind,
              canonicalRank: canonical.rank,
              range: {
                start: { line: rangeNode.startPosition.row + 1, column: rangeNode.startPosition.column },
                end: { line: rangeNode.endPosition.row + 1, column: rangeNode.endPosition.column }
              },
              label: (canonical as any).kind,
              isShallow: false,
              properties: {
                filePath: file.path,
                name: name,
                range: {
                  start: { line: rangeNode.startPosition.row + 1, column: rangeNode.startPosition.column },
                  end: { line: rangeNode.endPosition.row + 1, column: rangeNode.endPosition.column }
                },
                isExport: false,
                canonicalKind: canonical.kind,
                canonicalRank: canonical.rank,
                parentId,
                unitId: fileId,
                namespaceId: unitNode.metadata.namespaceId,
                rootId: unitNode.metadata.rootId,
                structureId: parentScopeName ? parentId : null,
                layer_path: `${unitNode.metadata.layer_path}/${name.toLowerCase()}`,
                depth: canonical.rank,
                fingerprint,
                dna,
                signature: { returnTypes: [], throwsTypes: [], sideEffects: [] },
                kinetic: {}
              },
              filePath: file.path,
              isExport: false,
              metadata: {
                id: scopedId,
                isTest: isTestFile,
                isExport: false,
                canonicalKind: canonical.kind,
                canonicalRank: canonical.rank,
                parentId,
                unitId: fileId,
                namespaceId: unitNode.metadata.namespaceId,
                rootId: unitNode.metadata.rootId,
                structureId: parentScopeName ? parentId : null,
                layer_path: `${unitNode.metadata.layer_path}/${name.toLowerCase()}`,
                depth: canonical.rank,
                fingerprint,
                dna,
                signature: { returnTypes: [], throwsTypes: [], sideEffects: [] },
                kinetic: {}
              }
            } as any);
          }
        }
        node = nodeCache.get(scopedId);
      }

      if (context.isDiscoveryMode()) continue;

      if (node && match.captures.some((c: any) => c.name === CaptureTags.IS_EXPORTED)) {
        node.isExport = true;
        node.metadata.isExport = true;
      }

      const captureMap: Record<string, string> = {};
      const args: string[] = [];

      match.captures.forEach((c: any) => {
        if (c.node) captureMap[c.name] = c.node.text;
        if (c.name === 'kinesis_arg' && c.node) args.push(c.node.text);
      });

      for (const capture of match.captures) {
        const cName = capture.name;
        const cText = capture.node.text;

        if (cName.startsWith('is')) {
          const kind = cName.slice(2).toLowerCase();

          if (kind === 'import') {
            const sourceCap = match.captures.find((c: any) => c.name === CaptureTags.SOURCE);
            if (sourceCap && sourceCap.node) {
              const specifier = sourceCap.node.text.replace(/^['"]|['"]$/g, '');

              // System 2 (ADR 0012): classify the boundary origin at capture. Edge properties now
              // persist, so this rides through to the vault — internal/stdlib/dependency + package.
              const boundary = classifyOrigin(specifier);

              // Seed the Spectrum with the RAW SPECIFIER for later resolution 🏺
              spectrum.relationships.push({
                sourceName: 'unit',
                targetName: specifier,
                type: 'IMPORTS' as any,
                confidence: 1.0,
                metadata: { specifier, isRaw: true, origin: boundary.origin, package: boundary.package }
              });

              for (let i = 0; i < match.captures.length; i++) {
                const cap = match.captures[i];
                if (cap.name === CaptureTags.NAME && cap.node) {
                  const aliasCap = (i + 1 < match.captures.length && match.captures[i + 1].name === 'alias')
                    ? match.captures[i + 1] : undefined;
                  const bindingName = cap.node.text;
                  const aliasName = (aliasCap && aliasCap.node) ? aliasCap.node.text : bindingName;

                  if (context) {
                    context.registerLocalBinding(aliasName, specifier);
                  }

                  // Per-binding IMPORTS relationship for function-level dead code detection
                  spectrum.relationships.push({
                    sourceName: 'unit',
                    targetName: specifier,
                    type: 'IMPORTS' as any,
                    confidence: 0.9,
                    metadata: { specifier, bindingName: bindingName.toLowerCase(), bindingNameRaw: bindingName, isRawBinding: true, origin: boundary.origin, package: boundary.package }
                  });
                }
              }
            }
          }

          if (node) {
            node.metadata[cName] = true;
          }

          // ONLY definition captures may set `kind`. Modifier captures (@isAsync, @isExported,
          // @isStatic, @isAbstract) have dedicated handling (dna at creation, isExport below) and
          // flow markers (@isPulse, @isKinetic, @isGuard, @isFlow, @isContract, @isConcurrent,
          // @isDeferred, @isVariadic) carry no kind at all. Ungated, any of them overwrote the
          // node's real kind — a public class became kind 'exported', which mapToCanonical falls
          // through to ATOM, demoting the class so prune could delete it. Pattern ordering cannot
          // fix this: query.matches() is NOT ordered by pattern index. See todo13.
          if (node && DEFINITION_CAPTURES.has(cName as any)) {
            node.kind = kind as any;

            const canonical = mapToCanonical(kind);
            node.canonicalKind = canonical.kind;
            node.canonicalRank = canonical.rank;
            node.metadata.canonicalKind = canonical.kind;
            node.metadata.canonicalRank = canonical.rank;
            node.metadata.displayName = node.name;

            const scope = getScopeAt(currentMatchRow, node.name);
            const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
            const scopedId = `${file.path.toLowerCase()}::${scopePrefix}${node.name.toLowerCase()}`;
            const registryEntry = context.getGlobalSymbol(scopedId);
            if (registryEntry) registryEntry.kind = kind;

            if (provider.calculateComplexity && (kind === 'function' || kind === 'method' || kind === 'class')) {
              const comp = provider.calculateComplexity(capture.node);
              node.metadata.complexity = comp;
              (node as any).complexity = comp;
            }
          }
        }
        else if ((cName === 'heritage' || cName === 'heritage_extends' || cName === 'heritage_implements') && node) {
          // The clause keyword IS the relation type. Queries whose grammar separates the two
          // clauses (typescript, tsx) capture @heritage_extends / @heritage_implements, so the
          // decision is made HERE, not guessed from the target's name. Plain @heritage keeps the
          // processor's name heuristic as a fallback for the languages not yet split.
          const explicit = cName === 'heritage_extends' ? 'EXTENDS'
            : cName === 'heritage_implements' ? 'IMPLEMENTS'
            : undefined;
          this.heritage.process(cText, node.name, spectrum, explicit);
        }
        else if (cName === 'alias' && node) {
          this.bindings.processAlias(node.name, cText, spectrum);
        }
        else if (cName === 'kinesis_target' || cName === 'kinesis_qualified_target') {
          const scope = getScopeAt(currentMatchRow);

          let finalTarget = cText;
          if (captureMap['kinesis_object']) {
            finalTarget = `${captureMap['kinesis_object']}.${cText}`;
          }

          const type = this.calls.isConstructor(finalTarget, provider) ? 'CONSTRUCTS' : 'CALLS';
          this.calls.process(finalTarget, scope, type, spectrum, args, context);

          // Reference-as-value: a bare identifier passed as a call ARGUMENT (a callback like
          // `addEventListener('load', initUI)`, or a function handed to a DI/command table) is a
          // USE of that symbol, not a call — the call processor only records the callee. Collect the
          // identifier args now; emit ACCESSES edges after the loop when nodeCache is complete.
          for (const rawArg of args) {
            const a = rawArg.trim();
            if (!/^[A-Za-z_$][\w$]*$/.test(a)) continue; // identifiers only (rejects strings/nums/exprs)
            refValueCandidates.push({ scope: (scope || 'unit').toLowerCase(), name: a.toLowerCase(), raw: a });
          }
        }
        else if (cName === 'ref_value') {
          // Object-literal value `{ key: someSymbol }` — a reference-as-value (DI table / command
          // map). Same handling as an identifier call-arg: collect now, emit + gate after the loop.
          const a = cText.trim();
          if (/^[A-Za-z_$][\w$]*$/.test(a)) {
            const scope = getScopeAt(currentMatchRow);
            refValueCandidates.push({ scope: (scope || 'unit').toLowerCase(), name: a.toLowerCase(), raw: a });
          }
        }
        else if (cName === 'pulse_assignment_name') {
          const val = captureMap['pulse_assignment_value'] ?? 'unknown';
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processAssignment(cText, val, scopeName, spectrum);
        }
        else if (cName === 'kinesis_route') {
          const pathReg = captureMap['kinesis_route_path'] ?? '/';
          const method = captureMap['route_method'] ?? 'GET';
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processRoute(pathReg, method, scopeName, spectrum, context.getFramework());

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
        else if (cName === CaptureTags.COMMENT && provider.extractDebt) {
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


    // Emit reference-as-value edges now that nodeCache holds every definition in this file. Gate on
    // "imported here OR defined in this file" — so a local-variable arg never floods the graph or adds
    // a dangler. IntraLinker binds the bare name against imported/same-file symbols afterward.
    for (const { scope, name, raw } of refValueCandidates) {
      if (!context.resolveLocalBinding(name) && !nodeCache.has(`${file.path.toLowerCase()}::${name}`)) continue;
      spectrum.relationships.push({
        sourceName: scope,
        targetName: name,
        type: 'ACCESSES' as any,
        confidence: 0.8,
        metadata: { referenceAsValue: true, original: raw }
      });
    }

    spectrum.nodes = Array.from(nodeCache.values());

    // Conducks: Hierarchical Unification (L2-L7 Parentage)
    // [Conducks Rule] MEMBER_OF edges are no longer persisted as structural scaffolding.
    // All containment is now column-based (parentId, unitId, structureId, etc.). 🏺

    // Conducks: Ingest Kinetic Git Signals (Only in Resolution Mode)
    if (!context.isDiscoveryMode()) {
      const resonance = (await chronicle.getCommitResonance(file.path)) || { count: 0 };
      const distribution = (await chronicle.getAuthorDistribution(file.path)) || {};
      const blameData = (await chronicle.getBlameData(file.path)) || [];
      const entropyRaw = calculateShannonEntropy(distribution);
      const entropyRisk = normalizeEntropyRisk(entropyRaw, Object.keys(distribution).length);
      const now = Math.floor(Date.now() / 1000);

      for (const n of spectrum.nodes) {
        // Blame Attribution
        const startLine = n.range.start.line;
        const endLine = n.range.end.line;
        const authors: Record<string, number> = {};
        let latestTime = 0;
        let earliestTime = now;

        for (let line = startLine; line <= endLine; line++) {
          if (!Array.isArray(blameData) || !(line in blameData)) continue;
          const meta = blameData[line];
          if (meta) {
            authors[meta.author] = (authors[meta.author] || 0) + 1;
            if (meta.timestamp > latestTime) latestTime = meta.timestamp;
            if (meta.timestamp < earliestTime) earliestTime = meta.timestamp;
          }
        }

        const authorEntries = Object.entries(authors);
        const primary = authorEntries.length > 0 ? authorEntries.sort((a, b) => b[1] - a[1])[0][0] : '';
        const count = authorEntries.length;
        const tenure = Math.floor((now - earliestTime) / 86400);

        n.metadata.kinetic = {
          resonance: resonance.count,
          entropy: entropyRisk,
          primaryAuthor: primary,
          authorCount: count,
          lastModified: latestTime,
          tenureDays: tenure > 0 ? tenure : 0,
          debtMarkers: n.metadata.debtMarkers || [],
          coveredBy: []
        };

        // Sync with top-level properties for persistence mapping
        (n as any).risk = n.metadata.risk || 0;
        (n as any).gravity = n.metadata.gravity || 0;
        (n as any).complexity = n.metadata.complexity || 0;
        (n as any).kinetic = n.metadata.kinetic;
        (n as any).dna = n.metadata.dna;
        (n as any).signature = n.metadata.signature;
        (n as any).fingerprint = n.metadata.fingerprint;
        (n as any).layer_path = n.metadata.layer_path;
        (n as any).depth = n.metadata.depth;
        (n as any).parentId = n.metadata.parentId;
        (n as any).unitId = n.metadata.unitId;
        (n as any).namespaceId = n.metadata.namespaceId;
        (n as any).rootId = n.metadata.rootId;
        (n as any).structureId = n.metadata.structureId;
      }
    }
    
    this.markTypeOnlyImports(spectrum);

    // Seed Import Map (Only in Discovery Mode)
    if (context.isDiscoveryMode()) {
      spectrum.relationships.filter(r => r.type === 'IMPORTS').forEach(r => {
        context.registerImport(file.path.toLowerCase(), r.targetName.toLowerCase());
      });
    }

    return spectrum;
  }
  /**
   * Conducks — Type-only import marking (ADR 0016). 🧬
   *
   * A dependency is what survives compilation: TypeScript erases an import whose bindings are only
   * ever used in type position, even when written as a plain `import { X } from`. Such an edge is
   * still recorded, but must not count as runtime coupling for cycle / hub findings.
   *
   * Marking requires POSITIVE evidence of a type use and NO evidence of a value use. A binding with
   * no usage relationships at all stays a value import — capture coverage is incomplete (bare value
   * uses like `foo(Bar)` or `export { Bar }` may emit nothing), so absence of evidence must not read
   * as type-only. Over-counting coupling is visible; hiding a real cycle is not (ADR 0016).
   */
  private markTypeOnlyImports(spectrum: PrismSpectrum): void {
    // In resolution mode a target is rewritten to a resolved id (`path::symbol`, or a dotted member
    // expression), so compare against the trailing segment rather than the raw string.
    const leaf = (name: string): string => name.split('::').pop()!.split('.').pop()!;

    // Node IDs are lowercased (required for APFS), which collapses a local variable onto a
    // same-named type — `nodeId` and `NodeId` both key to `nodeid`, so the variable's value uses
    // would mark the TYPE as value-used. Producers keep the pre-lowercase name in
    // `metadata.original`; prefer it so type and value namespaces stay distinct. Heritage targets
    // are never lowercased, so their targetName is already case-accurate.
    const caseSafeName = (rel: any): string | null => {
      const original = rel.metadata?.original;
      if (typeof original === 'string' && original) return leaf(original);
      if (rel.type === 'EXTENDS' || rel.type === 'IMPLEMENTS') return leaf(String(rel.targetName));
      return null;
    };

    const valueUses = new Set<string>();
    const typeUses = new Set<string>();
    // Names seen in a value position with no case-accurate spelling available. Matched
    // case-insensitively as a fallback so an unattributable use still blocks a type-only call.
    const valueUsesFolded = new Set<string>();

    for (const rel of spectrum.relationships) {
      // EXTENDS is a value use — a base class is a runtime binding. IMPLEMENTS is type-only.
      const isValue = rel.type === 'CALLS' || rel.type === 'CONSTRUCTS' || rel.type === 'ACCESSES' || rel.type === 'EXTENDS';
      const isType = rel.type === 'TYPE_REFERENCE' || rel.type === 'IMPLEMENTS';
      if (!isValue && !isType) continue;

      const name = caseSafeName(rel);
      if (isType) {
        if (name) typeUses.add(name);
      } else if (name) {
        valueUses.add(name);
      } else {
        valueUsesFolded.add(leaf(String(rel.targetName)).toLowerCase());
      }
    }

    const isTypeOnly = (binding: string): boolean => {
      const name = leaf(binding);
      return typeUses.has(name) && !valueUses.has(name) && !valueUsesFolded.has(name.toLowerCase());
    };

    // Per-binding edges first; the file-level edge is type-only only if every binding it carries is.
    const bindingsBySpecifier = new Map<string, { total: number; typeOnly: number }>();

    for (const rel of spectrum.relationships) {
      if (rel.type !== 'IMPORTS' || !rel.metadata?.isRawBinding) continue;
      const specifier = String(rel.metadata.specifier);
      const typeOnly = isTypeOnly(String(rel.metadata.bindingNameRaw ?? rel.metadata.bindingName));
      if (typeOnly) rel.metadata.isTypeOnly = true;

      const tally = bindingsBySpecifier.get(specifier) || { total: 0, typeOnly: 0 };
      tally.total++;
      if (typeOnly) tally.typeOnly++;
      bindingsBySpecifier.set(specifier, tally);
    }

    for (const rel of spectrum.relationships) {
      if (rel.type !== 'IMPORTS' || !rel.metadata?.isRaw) continue;
      const tally = bindingsBySpecifier.get(String(rel.metadata.specifier));
      // A side-effect import (`import './x.js'`) carries no bindings — it is a real runtime edge.
      if (tally && tally.total > 0 && tally.total === tally.typeOnly) {
        rel.metadata.isTypeOnly = true;
      }
    }
  }

  /**
   * Conducks — Gnosis Dynamic Fallback extractor (Regex-based). 🧬
   *
   * Activated when native bindings fail or are unavailable for a specific language.
   */
  private reflectGnosis(file: { path: string, source: string }, provider: ConducksProvider, context: AnalyzeContext): PrismSpectrum {
    const projectRoot = chronicle.getProjectDir()?.toLowerCase() || '';
    const fileId = `${file.path.toLowerCase()}::unit`;
    const relativePath = path.relative(projectRoot, file.path).toLowerCase();
    const rootName = path.basename(projectRoot).toLowerCase();

    const spectrum: PrismSpectrum = {
      nodes: [{
        name: path.basename(file.path),
        kind: 'FILE' as any,
        canonicalKind: 'STRUCTURE',
        canonicalRank: 1,
        metadata: {
          id: fileId,
          filePath: file.path,
          namespaceId: path.dirname(relativePath),
          rootId: `repository::${rootName}`,
          layer_path: relativePath,
          depth: 3
        },
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
        filePath: file.path,
        isExport: true
      }],
      relationships: [],
      metadata: { language: provider.langId }
    };

    if (provider.langId !== 'python' && provider.langId !== 'typescript' && provider.langId !== 'javascript') {
      if (process.env.CONDUCKS_DEBUG === '1') {
        console.error(`[Conducks Reflector] Gnosis fallback has no regex support for ${provider.langId}. Only file node captured for: ${file.path}`);
      }
      return spectrum;
    }

    const lines = file.source.split('\n');
    const classMeta = mapToCanonical('class');
    const funcMeta = mapToCanonical('function');

    let currentClassName: string | undefined;
    let currentClassId: string | undefined;
    let classIndentation = -1;
    let currentScopeName: string | undefined;

    if (process.env.CONDUCKS_DEBUG === '1') {
      console.log(`🛡️ [Gnosis] Fallback Pulsing: ${file.path} (${lines.length} lines)`);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const classMatch = line.match(/^(\s*)(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      const funcMatch = line.match(/^(\s*)(?:export\s+)?(?:async\s+)?(?:def|function)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      const pyImportMatch = line.match(/^(?:from\s+([a-zA-Z0-9_\.]+)\s+)?import\s+([a-zA-Z0-9_,\s]+)/);
      const tsImportMatch = line.match(/^(?:import|export)\s+.*from\s+['"]([^'"]+)['"]/);
      const callMatches = [...line.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\(/g)];

      const indent = line.search(/\S/);
      if (indent === -1) continue;

      if (classMatch) {
        const name = classMatch[2];
        const id = `${fileId}::${name}`;
        const infraSuffixes = ['Service', 'Router', 'Controller', 'Registry', 'Store', 'Runner', 'Manager', 'Engine', 'Writer', 'Reporter', 'Provider', 'Client'];
        const isInfra = infraSuffixes.some(s => name.endsWith(s));
        const activeKind = isInfra ? 'infra' : 'class';
        const activeMeta = mapToCanonical(activeKind);

        if (process.env.CONDUCKS_DEBUG === '1') console.log(`🛡️ [Gnosis] Found ${isInfra ? 'Infra' : 'Class'}: ${name}`);

        spectrum.nodes.push({
          name,
          kind: (isInfra ? 'INFRA' : 'STRUCTURE') as any,
          canonicalKind: activeMeta.kind,
          canonicalRank: activeMeta.rank,
          metadata: { id, isStruct: !isInfra, isInfra, lineStart: i + 1, unitId: fileId },
          range: { start: { line: i, column: indent }, end: { line: i, column: indent + name.length } },
          filePath: file.path,
          isExport: line.includes('export')
        } as any);
        currentClassName = name;
        currentClassId = id;
        classIndentation = indent;
        currentScopeName = name;
      } else if (funcMatch) {
        const name = funcMatch[2];
        const id = `${fileId}::${name}`;
        const isMethod = currentClassId !== undefined && indent > classIndentation;
        const displayName = isMethod ? `${currentClassName}.${name}` : name;

        if (process.env.CONDUCKS_DEBUG === '1') console.log(`🛡️ [Gnosis] Found ${isMethod ? 'Method' : 'Func'}: ${displayName} (Parent: ${currentClassId})`);

        spectrum.nodes.push({
          name: displayName,
          kind: (isMethod ? 'BEHAVIOR' : 'FUNCTION') as any,
          canonicalKind: funcMeta.kind,
          canonicalRank: funcMeta.rank,
          metadata: { id, lineStart: i + 1, parentId: isMethod ? currentClassId : undefined, unitId: fileId },
          range: { start: { line: i, column: indent }, end: { line: i, column: indent + name.length } },
          filePath: file.path,
          isExport: line.includes('export')
        } as any);
        currentScopeName = displayName;
      }

      // Semantic Edge Extraction
      const specifier = pyImportMatch ? (pyImportMatch[1] || pyImportMatch[2].split(',')[0].trim()) : (tsImportMatch ? tsImportMatch[1] : null);
      if (specifier) {
        spectrum.relationships.push({
          sourceName: 'unit',
          targetName: specifier,
          type: 'IMPORTS' as any,
          confidence: 1.0,
          metadata: { specifier, isRaw: true }
        });
      }

      if (callMatches.length > 0) {
        for (const match of callMatches) {
          const target = match[1];
          if (['if', 'elif', 'def', 'while', 'for', 'return', 'class', 'import', 'from', 'await', 'switch', 'catch', 'function'].includes(target)) continue;

          spectrum.relationships.push({
            sourceName: currentScopeName || 'unit',
            targetName: target,
            type: 'CALLS' as any,
            confidence: 0.8,
            metadata: { target, isRaw: true, isGnosis: true }
          });
        }
      }
    }
    return spectrum;
  }
}

