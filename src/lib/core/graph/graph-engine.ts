import { ConducksAdjacencyList, type ConducksNode, type ConducksEdge, type EdgeType } from "./adjacency-list.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";

/**
 * This file is where a parsed relationship BECOMES a graph edge, so it is where the two unions have
 * to agree. They did not: `rel.type` was written into the edge with an `as any`, so a processor
 * could invent a type and the vault would store it — `DEFINES` did exactly that, and four rows of it
 * sat under a type `EdgeType` had never heard of, invisible to every classification keyed on the
 * union.
 *
 * The cast is gone; this assertion is what keeps it gone. Adding a relationship type the graph does
 * not classify is now a compile error here rather than a surprise in the vault.
 */
type _ParserTypesAreEdgeTypes =
  PrismSpectrum['relationships'][number]['type'] extends EdgeType ? true
  : ['relationship type is not an EdgeType — add it to EdgeType and classify it in EDGE_COUPLING'];
const _assertParserTypesAreEdgeTypes: _ParserTypesAreEdgeTypes = true;
void _assertParserTypesAreEdgeTypes;
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { Logger } from "../utils/logger.js";
import { PrismRequest } from "@/lib/core/parsing/prism-core.js";
import { StructuralRanker } from "../../core/graph/algorithms/ranker.js";
import { CanonicalKind, CanonicalRank } from "@/lib/core/parsing/taxonomy.js";
import { Worker } from "node:worker_threads";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Technical Graph Engine 🛡️ 🧬
 * 
 * Logic for reflecting the technical structure into the graph.
 * Implements the Conducks Two-Pass Identity Model.
 */
export class ConducksGraph {
  private graph = new ConducksAdjacencyList();
  private logger = new Logger("ConducksGraph");

  /**
   * Provides the current Synapse Structural Adjacency List.
   */
  public getGraph(): ConducksAdjacencyList {
    return this.graph;
  }

  /**
   * Pulses the structural stream into the technical graph.
   * Kinetic Engine v3 — CPU-Parallelized via Worker Threads.
   */
  public async pulseStructuralStream(stream: PrismRequest[]): Promise<void> {
    const unitCount = stream.length;
    this.logger.info(`[Conducks Synapse] Pushing Structural Stream (${unitCount} units)...`);

    if (unitCount === 0) return;

    const coreCount = Math.max(1, os.cpus().length - 1);
    const chunkSize = Math.ceil(unitCount / coreCount);
    const isTs = __filename.endsWith('.ts');
    const workerScript = path.resolve(__dirname, `../parsing/pulse-worker.${isTs ? 'ts' : 'js'}`);
    const workerPromises = [];

    for (let i = 0; i < unitCount; i += chunkSize) {
      const chunk = stream.slice(i, i + chunkSize);

      const p = new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerScript, {
          workerData: { units: chunk },
          execArgv: isTs ? ["--import", "tsx"] : []
        });

        worker.on('message', (results: any[]) => {
          for (const res of results) {
            if (res.error) {
              this.logger.error(`[Conducks Synapse] Worker failure in ${res.path}: ${res.error}`);
              continue;
            }
            this.ingestSpectrum(res.path, res.spectrum);
          }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
          else resolve();
        });
      });
      workerPromises.push(p);
    }

    await Promise.all(workerPromises);

    // Phase 2: Neural Binding (Universal Workspace Resolution)
    this.resonate();
    this.logger.info(`[Conducks Synapse] Pulse complete: ${this.graph.stats.nodeCount} Neurons active.`);
  }

  /**
   * Conducks — Structural Resonance
   * 
   * Triggers the full structural intelligence pipeline.
   */
  /**
   * Edges created by the binders during the LAST `resonate()`.
   *
   * `resonate()` runs after the final wave flush, so anything it adds exists only in memory.
   * `save()` writes the pulse record and metadata — it has NO branch that writes node or edge
   * rows, in any mode. Cross-service CALLS edges were therefore built correctly and then dropped
   * on every pulse. The caller persists these explicitly (todo22#P15); anything else a binder
   * creates after the last flush needs its own save call or it is lost the same way.
   */
  public lastResonanceEdges: ConducksEdge[] = [];

  public resonate(): void {
    this.logger.info(`[Conducks Synapse] Pushing Structural Resonance Flow...`);
    this.lastResonanceEdges = [];
    this.bindNeuralCircuits();
    this.bindRouteCircuits();
    this.bindPulseCircuits();
    StructuralRanker.calculateGravity(this.graph);
  }

  /**
   * Conducks — Pulse Binding (Variable Handover)
   */
  private bindPulseCircuits(): void {
    for (const node of this.graph.getAllNodes()) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');

      // The producer lookup used to be `assignments.find(...)` run once per call ARGUMENT, and it
      // re-split every assignment's target id on every one of those scans — O(calls x args x
      // assignments) with a string split per comparison, for a node with many outgoing edges.
      // Indexing the assignments once per node makes each argument an O(1) lookup, and each id is
      // split exactly once.
      let producersByName: Map<string, ConducksEdge> | null = null;
      const calls: ConducksEdge[] = [];
      // Calls indexed by the SOURCE TEXT of their target, so an assignment's right-hand side can be
      // matched back to the call that produced it (ADR 0051).
      const callsByOriginal = new Map<string, ConducksEdge>();
      for (const e of outgoing) {
        if (e.properties?.reason === 'assignment') {
          const produced = e.targetId.split('::').pop();
          if (produced) {
            if (!producersByName) producersByName = new Map();
            if (!producersByName.has(produced)) producersByName.set(produced, e);
          }
        }
        if (e.type === 'CALLS' && !e.properties?.isResonance) {
          calls.push(e);
          const original = String(e.properties?.original ?? '').toLowerCase();
          if (original && !callsByOriginal.has(original)) callsByOriginal.set(original, e);
        }
      }
      if (!producersByName || calls.length === 0) continue;

      for (const call of calls) {
        const args = (call.properties?.arguments as string[]) || [];
        for (const arg of args) {
          const producer = producersByName.get(arg);
          if (producer) {
            // The SOURCE is the producing CALL's target — the function whose output was handed on —
            // not the variable that carried it (ADR 0051). `producer.targetId` is the variable name,
            // which is not a node id, so 199 of these edges used to point FROM something the graph
            // did not contain. `audit` never saw it because its orphan check reads targets only.
            //
            // The assignment edge records its right-hand side in `value`; matching that against the
            // calls in this same scope recovers the producing call. When it cannot be recovered the
            // edge is NOT written: a handover whose producer is unknown is a guess, and an edge from
            // a non-existent node is worse than a missing edge (ADR 0046, CONDUCKS-32).
            const rhs = String(producer.properties?.value ?? '').toLowerCase().replace(/\(.*$/, '').trim();
            const producingCall = rhs ? callsByOriginal.get(rhs) : undefined;
            if (!producingCall) continue;
            // Collected, not just added. `bindPulseCircuits` runs after the last wave flush like
            // every other binder, so an edge that is only added to the in-memory graph is dropped
            // when the pulse commits — the vault held 0 PULSES_TO rows on every project. The
            // caller persists `lastResonanceEdges`; this is the same remedy bindResonance already
            // uses, and the name is now a misnomer for "edges the binders built".
            //
            // A HANDOVER BELONGS TO THE SCOPE IT HAPPENS IN, and `node` IS that scope — it is the
            // symbol whose outgoing edges this loop is reading, so the producing call and the
            // consuming call are both inside it by construction.
            //
            // That fact used to reach the edge only by ACCIDENT. The id was built from `call.id`,
            // and a CALLS edge's id is `SEMANTIC::<scope>-><target>::calls` (see `ingestSpectrum`),
            // so the scope was in there — smuggled through another edge's id format, readable by
            // nobody, and queryable by nothing. Meanwhile `properties` named the variable and never
            // named the function. So the only ANSWERABLE form of the edge was "path.resolve feeds
            // path.dirname", stated globally, when what actually happened was "inside THIS symbol,
            // path.resolve feeds path.dirname". 124 of 238 of these edges on this repository have a
            // library symbol at both ends, and every one of them was making a claim about node's
            // `path` module rather than about the code being analysed (ADR 0059's open question).
            //
            // Two changes, and neither moves an endpoint:
            //   1. `scope` is a PROPERTY, so the attribution is queryable without parsing an id;
            //   2. the id is built from `node.id` and `call.targetId` DIRECTLY, rather than from
            //      `call.id`. Same tuple (scope, producer, consumer), stated on purpose. It also
            //      drops a latent lie: `bindNeuralCircuits` and `IntraLinker` rebind a call's
            //      TARGET without rewriting its ID, so `call.id`'s target segment can name a symbol
            //      `call.targetId` no longer points at.
            //
            // The ENDPOINTS are deliberately unchanged. ADR 0051 settled that a handover's source
            // is the PRODUCING CALL's target — "produce's output feeds consume" says more than
            // "this variable pulses to consume" — and running the edge from `node` to the consumer
            // instead would undo it, discard the producer, and duplicate the CALLS edge that
            // already joins those two. The scope is the third leg of a triple that an edge has only
            // two ends for, so it travels as a property. ADR 0059's `local` coupling still holds:
            // this is still below module level, still not an import, and now says so explicitly.
            //
            // RESIDENCY: `node.id` is safe to bake into an id only because the orchestrator reloads
            // the WHOLE graph from the vault before calling `resonate()` (analysis/index.ts, ADR
            // 0041's clear-per-wave is undone there). Nothing here depends on which wave a file
            // landed in — the same trap todo22#P7 removed from `ingestSpectrum`'s Ghost Local strip.
            const edge: ConducksEdge = {
              id: `PULSE::${node.id}::${producingCall.targetId}->${call.targetId}`,
              sourceId: producingCall.targetId,
              targetId: call.targetId,
              type: 'PULSES_TO',
              confidence: 0.7,
              properties: { reason: 'handover', variable: arg, scope: node.id }
            };
            this.graph.addEdge(edge);
            this.lastResonanceEdges.push(edge);
          }
        }
      }
    }
  }

  /**
   * Conducks — Route Binding (Microservice Bridge)
   */
  private bindRouteCircuits(): void {
    // Was a full cross product: every request against every route, compiling a fresh RegExp inside
    // the inner comparison — O(requests x routes) regex COMPILATIONS, which is far more expensive
    // than the match itself. Three changes, none of which alter which pairs match:
    //   1. routes are bucketed by HTTP method, so a GET request never looks at a POST route;
    //   2. each route's pattern is compiled ONCE, not once per request;
    //   3. a route with no parameters is a string comparison, never a regex.
    // Worst case is still O(requests x routes-of-that-method), which is inherent to pattern
    // matching, but the compilations drop to O(routes) and exact hits to O(1).
    const routesByMethod = new Map<string, Array<{ node: ConducksNode; pattern: RegExp | null; path: string }>>();
    const requests: ConducksNode[] = [];

    // One pass, rather than materialising every node and filtering it twice.
    for (const node of this.graph.getAllNodes()) {
      if (node.properties.isRequest) requests.push(node);
      if (!node.properties.isRoute) continue;

      const method = String(node.properties.method ?? '');
      const routePath = ConducksGraph.normalizeUrl(node.properties.path as string);
      let bucket = routesByMethod.get(method);
      if (!bucket) { bucket = []; routesByMethod.set(method, bucket); }
      bucket.push({ node, pattern: ConducksGraph.routePattern(routePath), path: routePath });
    }

    for (const req of requests) {
      const reqUrl = req.properties.url;
      const reqMethod = String(req.properties.method ?? '');
      const normReq = ConducksGraph.normalizeUrl(reqUrl as string);

      // Every route of this method is still considered, because the original bound a request to
      // EVERY route it matched, not just the first. Short-circuiting on the first exact hit was
      // tried and rejected: it silently dropped edges when two routes share a path, which is a
      // behaviour change wearing a performance costume.
      //
      // What the precomputation buys is the pattern: a literal route matches only its own text, so
      // it is compared as a string, and a parameterised route uses a regex compiled ONCE for the
      // route instead of once per request-route pair.
      for (const { node: route, pattern, path: routeNorm } of routesByMethod.get(reqMethod) ?? []) {
        const matches = pattern === null ? routeNorm === normReq : pattern.test(normReq);
        if (matches) this.bindResonance(req, route, reqUrl as string);
      }
    }
  }

  private bindResonance(req: ConducksNode, route: ConducksNode, reqUrl: string): void {
    const edge: ConducksEdge = {
      id: `RESONANCE::${req.id}->${route.id}`,
      sourceId: req.id,
      targetId: route.id,
      type: 'CALLS' as any,
      confidence: 0.9,
      properties: { isResonance: true, url: reqUrl }
    };
    this.graph.addEdge(edge);
    this.lastResonanceEdges.push(edge);
  }

  /** Trailing slash carries no meaning in a route, so both sides are compared without one. */
  private static normalizeUrl(url: string | undefined): string {
    return url?.replace(/\/$/, "") || "";
  }

  /**
   * Compile a route path into the pattern that matches request URLs against it.
   *
   * Returns null for a literal path with no parameters — the caller answers those from a map, so
   * the regex is never built. Compiling this once per ROUTE rather than once per request-route
   * PAIR is the whole point: pattern compilation dominated the cost of route binding.
   */
  private static routePattern(normRoute: string): RegExp | null {
    if (!/[{:]/.test(normRoute)) return null;
    const regexPattern = normRoute.replace(/\{[^}]+\}/g, "[^/]+").replace(/:[^\/]+/g, "[^/]+");
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Conducks — Ingests a reflected spectrum into the Synapse Graph.
   * Conducks Induction: Focus on local symbol ingestion and membership anchoring.
   */
  public ingestSpectrum(rawPath: string, spectrum: PrismSpectrum, shallow: boolean = false, unitId?: string, rootId?: string): void {
    const filePath = canonicalize(rawPath);
    
    // Pass 1: Ingest Semantic Nodes (Symbols)
    for (const metaNode of spectrum.nodes) {
      const m = metaNode.metadata || {};
      const nodeId = m.id ? m.id.toLowerCase() : `${filePath}::${metaNode.name.toLowerCase()}`;
      // A file node's parent is its DIRECTORY, which the skeleton pass already established and
      // flushed. `unitId` here IS this node's own id, so the old fallback made every unit its own
      // parent — 334 self-loops, and every parent-walk on them ran to its hop limit and gave up.
      // Leaving it null lets the skeleton's value stand, because the UPDATE coalesces this column.
      const computedParent = m.parentId ? m.parentId.toLowerCase() : (unitId || null);
      const parentId = computedParent === nodeId ? null : computedParent;

      // The SAME guard, on the column ADR 0056 did not reach. `unitId` answers "which file contains
      // this node", and a file does not contain itself — persistence.ts:531 documents that a unit's
      // own row carries `unitId = NULL`, and `purgeUnits` is written against it. This line was
      // `unitId: unitId || null`, which for the UNIT node itself is its own id, so 337 files were
      // recorded as their own unit. reflector.ts already emits `unitId: null` for the unit node
      // (todo26 Phase 0); the spread below then overwrote it here, which is why fixing the
      // reflector alone changed nothing in the vault.
      const ownUnitId = unitId === nodeId ? null : (unitId || null);

      this.graph.addNode({
        id: nodeId,
        label: (metaNode as any).canonicalKind || 'UNIT',
        isShallow: shallow, 
        properties: { 
          ...metaNode, 
          ...m, 
          filePath, 
          name: metaNode.name, 
          range: metaNode.range, 
          isExport: metaNode.isExport || m.isExport,
          canonicalKind: (metaNode as any).canonicalKind || 'UNIT',
          // The two fallbacks have to AGREE. The kind fell back to UNIT and the rank to 2, which is
          // DIRECTORY's rung — so an unranked node arrived claiming to be a file sitting where a
          // folder sits. Derive the rank from whichever kind actually won (ADR 0099).
          canonicalRank: (metaNode as any).canonicalRank
            ?? CanonicalRank[((metaNode as any).canonicalKind || CanonicalKind.UNIT) as CanonicalKind]
            ?? CanonicalRank[CanonicalKind.UNIT],
          parentId: parentId,
          unitId: ownUnitId,
          rootId: rootId || null
        } as any
      });

      // Structural Membership Edge
      if (parentId) {
        this.graph.addEdge({
          id: `MEMBER::${nodeId}->${parentId}`,
          sourceId: nodeId,
          targetId: parentId,
          type: 'MEMBER_OF',
          confidence: 1.0,
          properties: {}
        });
      }
    }

    // Pass 2: Ingest Local Relationships (Semantic Logic)
    for (const rel of spectrum.relationships) {
      // IMPORTS are skipped here; handled by Pass 3 in Orchestrator for high-fidelity resolution.
      if (rel.type === 'IMPORTS') continue; 
      if (rel.type === 'MEMBER_OF') continue; 

      const sourceId = `${filePath}::${(rel.sourceName || 'unit').toLowerCase()}`;
      
      // Conducks: Smart Resolution v1.9.1
      // We only prefix if it's a known local symbol. 
      // If it's already prefixed but missing, we strip it to allow virtual induction.
      let targetId = rel.targetName.toLowerCase();
      if (!targetId.includes('::')) {
        const localCandidate = `${filePath}::${targetId}`;
        if (this.graph.hasNode(localCandidate)) {
          targetId = localCandidate;
        }
      }
      // THE "GHOST LOCAL" STRIP IS GONE, and it was a correctness bug wearing a performance costume.
      //
      // It used to degrade a fully-qualified target id to its bare last segment whenever that node
      // was not resident in the IN-MEMORY graph. The orchestrator CLEARS that graph after every wave
      // flush (ADR 0041), so residency is a function of wave size and file order — not of the code
      // being analyzed. The same edge kept its exact target in a one-wave run and fell back to a
      // fuzzy name lookup in a five-wave one, and the two disagreed.
      //
      // MEASURED on this repo, 551 units, cold vault per arm, each arm byte-identical across repeat
      // runs so it is deterministic rather than noisy: CHUNK_SIZE 500 gave 4,205 vault nodes and
      // CHUNK_SIZE 100 gave 4,212, with 258 edge ids differing EACH WAY. Two suspects were killed by
      // measurement first — worker count changes nothing, and the union of node ids the waves put in
      // memory is identical (7,014) at both sizes, so the divergence is purely in edge target
      // resolution and the node count follows it, because `pruneTaxonomy` drops an ATOM with no
      // non-structural edge.
      //
      // With the strip removed, wave sizes 37, 100 and 500 produce byte-identical node AND edge id
      // sets. The trade is stated rather than hidden: against the unpatched 500 arm it is -28 nodes
      // and +1 edge. IntraLinker's FUZZY resolutions fall 2,925 -> 2,476 because those edges now
      // carry their exact target instead of being re-guessed by name, persisted binder edges rise
      // 181 -> 206 and dropped fall 194 -> 169. The 28 lost ATOMs are ones the fuzzy edge was
      // keeping alive (todo22#P7).

      // ONE EDGE PER RELATIONSHIP, ALL of its call sites.
      //
      // The id carries no line, and `addEdge` returns early on a duplicate id — so a function
      // calling the same target eleven times produced ONE edge and the other ten lines were
      // silently dropped. Measured on openship: `git-clone.test.ts` calls `assembleGitClone` at
      // lines 59, 76, 82, 100, 138, 142, 148, 155, 156, 162 and 173, and the graph knew only 59.
      // "Every call site of X" was therefore unanswerable however the question was asked.
      //
      // The line is NOT put in the id. Something parses that format (see the handover comment
      // above), edge ids are content-hashed, and multiplying edges would change every count that
      // uses them as a denominator. Collecting the lines on the one edge keeps the graph's shape
      // and answers the question (ADR 0110).
      const edgeId = `SEMANTIC::${sourceId}->${targetId}::${rel.type.toLowerCase()}`;
      const line = Number((rel.metadata as any)?.line ?? 0) || 0;
      const existing = this.graph.getNeighbors(sourceId, 'downstream')
        .find(e => e.id === edgeId.toLowerCase());

      if (existing) {
        const props = (existing.properties ??= {}) as Record<string, unknown>;
        const lines = (props.lines ??= []) as number[];
        if (line && !lines.includes(line)) lines.push(line);
        continue;
      }

      this.graph.addEdge({
        id: edgeId,
        sourceId,
        targetId,
        type: rel.type,
        confidence: rel.confidence || 1.0,
        // `line` stays as the FIRST site, so every existing reader is unchanged; `lines` is the
        // complete set.
        properties: { ...(rel.metadata || {}), ...(line ? { lines: [line] } : {}) }
      });
    }
  }

  /**
   * Conducks — Neural Binding
   * Dynamic fallback resolution for local ambiguities.
   */
  private bindNeuralCircuits(): void {
    const allNodes = Array.from(this.graph.getAllNodes());
    for (const node of allNodes) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');
      for (const edge of outgoing) {
        if (!edge.targetId.includes('::') && edge.properties?.rawTarget) {
          const localId = `${node.properties.filePath}::${edge.properties.rawTarget.toLowerCase()}`;
          if (this.graph.getNode(localId)) {
            // MUST go through rebindEdgeTarget, not a bare assignment. `inEdges` is a separate
            // backward index keyed by target, and moving the target without updating it leaves the
            // edge filed under the id it no longer points at — so `getNeighbors(newTarget,
            // 'upstream')` misses it while the old target still returns it. That index is what
            // `impact` walks, which meant "who calls this" lost exactly the edges this binder had
            // just repaired. IntraLinker has always done it correctly (linker-intra.ts).
            this.graph.rebindEdgeTarget(edge, localId);
          }
        }
      }
    }
  }

  /**
   * Conducks Streaming: Synapse-to-Vault Flush 🏺
   * 
   * Moves all current in-memory nodes/edges to the structural vault 
   * and purges the RAM to allow for the next wave of induction.
   */
  public async flushAndClear(persistence: any, pulseId: string): Promise<{ nodeCount: number, edgeCount: number }> {
    const nodes = Array.from(this.graph.getAllNodes());
    const edges = this.graph.getAllEdges();

    const stats = { nodeCount: nodes.length, edgeCount: edges.length };

    if (nodes.length > 0) {
      this.logger.info(`🛡️ [Conducks Synapse] Flushing ${nodes.length} nodes to vault...`);
      await persistence.saveNodes(nodes, pulseId);
    }

    if (edges.length > 0) {
      this.logger.info(`🛡️ [Conducks Synapse] Flushing ${edges.length} edges to vault...`);
      await persistence.saveEdges(edges, pulseId);
    }

    this.graph.clear();
    return stats;
  }
}
