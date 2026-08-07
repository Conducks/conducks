/**
 * Conducks — Optimized Graph Logic
 *
 * High-performance adjacency list for structural codebase representation.
 * Optimized for O(1) neighborhood lookups and recursive traversals.
 */

export type NodeId = string;
// PULSES_TO used to be written as `'PULSES_TO' as any` because it was missing here. A cast is how
// an edge type stays invisible to every exhaustive switch over EdgeType, and it is part of why
// nothing noticed the vault held none of them.
// DEFINES and ALIASES were BOTH reaching the vault through `as any` — `DEFINES` cast at its emit
// site, `ALIASES` through the blanket cast at the parser boundary. Four `DEFINES` rows were in the
// vault under a type the union did not contain. Naming them here is what lets the classification
// below be checked at all.
export type EdgeType = 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'ACCESSES' | 'MEMBER_OF' | 'DEPENDS_ON' | 'FROM_IMAGE' | 'VIRTUAL_LINK' | 'CONSTRUCTS' | 'TYPE_REFERENCE' | 'CONTAINS' | 'HAS_METHOD' | 'HAS_PROPERTY' | 'PULSES_TO' | 'GOVERNS' | 'DEFINES' | 'ALIASES';

/**
 * Every edge type is runtime-visible at exactly one of these levels, and the levels NEST:
 * containment ⊂ erased ⊂ local ⊂ module. Each classification below therefore takes the widest
 * level it belongs to, and the three exported sets are derived rather than hand-listed.
 *
 * - `containment` — "X is defined inside Y", NOT "X depends on Y". A TS interface owning its fields
 *   (HAS_PROPERTY), a class owning its methods (HAS_METHOD), a member belonging to its file
 *   (MEMBER_OF), a file containing a symbol (CONTAINS) form trivial loops (type → property → file →
 *   type) that are not circular dependencies. Ignoring these is what stops every interface and
 *   singleton reading as a false cycle.
 * - `erased` — not runtime coupling at all: type references the compiler erases (ADR 0016), and
 *   doc→code links (ADR 0058). Cycle and hub findings ignore these; dead-code still counts a type
 *   reference as usage, which is a different question.
 * - `local` — real runtime coupling, but BELOW module level. A CALLS edge onto a parameter's method
 *   resolves onto the owning class purely because the parameter is type-annotated, which closes
 *   loops that do not exist between modules.
 * - `module` — a module-level dependency. ARCH-3 traverses exactly these.
 */
type EdgeCoupling = 'containment' | 'erased' | 'local' | 'module';

/**
 * The classification, as an exhaustive `Record` rather than a set of array literals.
 *
 * An array cannot be exhaustive, and that is not a hypothetical: `PULSES_TO` was added to `EdgeType`
 * and never added HERE, so ARCH-3 — which means a MODULE IMPORT cycle (ADR 0017) — traversed
 * dataflow edges and reported node's own standard library as circular:
 * `path.dirname -> path.join -> path.resolve`. Those three functions do not call each other. The
 * edges are handovers between nested `path` calls in this project's own source, and a handover
 * is not an import.
 *
 * With a `Record<EdgeType, …>` the compiler refuses a new member of the union until somebody has
 * said what it couples. This is the same remedy ADR 0053 applied to `RESOLVABLE`.
 */
const EDGE_COUPLING: Record<EdgeType, EdgeCoupling> = {
  // containment (ADR 0010)
  MEMBER_OF: 'containment',
  CONTAINS: 'containment',
  HAS_METHOD: 'containment',
  HAS_PROPERTY: 'containment',

  // erased — present in the source, absent at runtime
  TYPE_REFERENCE: 'erased',   // the compiler removes it (ADR 0016)
  GOVERNS: 'erased',          // a doc pinning a file is not a call (ADR 0058); letting it carry
                              // structural weight would make a module's rank a function of how much
                              // documentation sits beside it
  DEFINES: 'erased',          // a scope declaring an HTTP route. The route node is virtual — its
                              // `filePath` is the literal string 'network' — so it is not code and
                              // must not compete with code for gravity, on GOVERNS' reasoning

  // local — runtime coupling below module level
  CALLS: 'local',
  CONSTRUCTS: 'local',
  ACCESSES: 'local',
  PULSES_TO: 'local',         // a value handover between two calls. Further from a module import
                              // than CALLS is, which is why it belongs here and not in `module`
  ALIASES: 'local',           // a local renaming of a symbol (`import { x as y }`, Go/Ruby wildcard
                              // bindings). The IMPORTS edge already carries the module dependency,
                              // so counting the alias again would double-count one import

  // module — ARCH-3 traverses these
  IMPORTS: 'module',
  EXTENDS: 'module',
  IMPLEMENTS: 'module',
  DEPENDS_ON: 'module',
  FROM_IMAGE: 'module',
  VIRTUAL_LINK: 'module',
};

const atOrBelow = (...levels: EdgeCoupling[]): EdgeType[] =>
  (Object.keys(EDGE_COUPLING) as EdgeType[]).filter(t => levels.includes(EDGE_COUPLING[t]));

/** Containment edges — see `EDGE_COUPLING`. */
export const STRUCTURAL_EDGE_TYPES: EdgeType[] = atOrBelow('containment');

/** Edges that are not runtime coupling: containment plus erased. */
export const NON_RUNTIME_EDGE_TYPES: EdgeType[] = atOrBelow('containment', 'erased');

/**
 * Edges ARCH-3 does not traverse: everything that is not module-level coupling. Pair with
 * `ignoreTypeOnly` to drop erased imports too.
 */
export const IMPORT_CYCLE_IGNORED_EDGE_TYPES: EdgeType[] = atOrBelow('containment', 'erased', 'local');

export interface ConducksNode<T = any> {
  id: NodeId;
  label: string;
  isShallow?: boolean;        // Conducks: If true, properties only contains Skeleton data
  properties: T & {
    name: string;
    filePath: string;
    kind?: string;            // Conducks: Language-specific kind (class, function)
    parentname?: string;      // Conducks: Hierarchical parent name (L1/L2)
    kineticEnergy?: number;
    rank?: number;
    isEntryPoint?: boolean;
    isExport?: boolean;
    canonicalKind: string;    // Conducks: Canonical Taxonomy Layer (STRUCTURE, BEHAVIOR, etc.)
    canonicalRank: number;    // Conducks: Architectural Rank (0-7)
    
    // Universal Structural DNA (Oracle Standard)
    fingerprint?: string;     // SHA256 of structural identity
    parentId?: string;        // Explicit hierarchical parent
    unitId?: string;          // Source file unit ID
    rootId?: string;          // Root ancestor node ID
    namespaceId?: string;     // Logical namespace container
    structureId?: string;     // Primary structure container
    layer_path?: string;      // Materialized path (e.g. L0/L1/L2)
    depth?: number;           // Hierarchy depth
    risk?: number;            // 0-1 complexity risk
    gravity?: number;         // PageRank importance
    complexity?: number;      // Cyclomatic/Halstead composite
    
    // Rich DNA Blocks (JSON)
    dna?: any;
    kinetic?: any;
    signature?: any;

    // Meat (Metadata - only present if not shallow)
    debtMarkers?: string[];
    resonance?: number;
    entropy?: number;
    primaryAuthor?: string;
    authorCount?: number;
    lastModified?: number;
    tenureDays?: number;
    coveredBy?: string[];
    layer?: number;
    range?: any;              // Position data
  };
}

export interface ConducksEdge<T = any> {
  id: string; // "sourceId::targetId::type"
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  confidence: number;
  properties: T;
}

import { CycleDetector } from "./algorithms/cycle-detector.js";
import { StructuralRanker } from "./algorithms/ranker.js";
import { GraphTraversal } from "./algorithms/traversal.js";
import zlib from "zlib";


/**
 * High-performance graph storage optimized for intelligence analysis.
 */
/** Shared empty result, so a miss allocates nothing. */
const EMPTY_ID_SET: ReadonlySet<NodeId> = new Set<NodeId>();

export class ConducksAdjacencyList {
  /**
   * Set while a lazy load is DEFERRED: reading this graph is a bug until it is materialised.
   *
   * The registry already guards `infrastructure.graphEngine`, but that getter only sees callers who
   * go through it. `search`, `kinetic` and `governance` are handed `graph.getGraph()` at
   * CONSTRUCTION (`registry/index.ts:118,132,138`) and hold the object directly, so the getter never
   * runs for them — a deferred graph reads as an EMPTY one and every answer is a silent zero. That
   * is CONDUCKS-13, and it is why `needsGraph` had to be opt-OUT rather than opt-in (todo21#P5).
   *
   * The guard therefore lives on the OBJECT rather than on the accessor. Every holder shares this
   * one instance, whenever they captured it, so one flag covers all of them and no constructor
   * signature has to change.
   *
   * A WRITE clears it (see `addNode`), because a graph someone is filling is not deferred — that is
   * how `analyze` legitimately reads a graph it built from source rather than from the vault.
   * Only a read of a graph that is empty AND unfilled can silently answer "nothing".
   */
  private deferred: boolean = false;

  /** Mark the graph unreadable until `load()` materialises it. */
  public markDeferred(): void { this.deferred = true; }

  /** Called by the loader once rows are in: the graph now answers for real. */
  public markMaterialised(): void { this.deferred = false; }

  public get isDeferred(): boolean { return this.deferred; }

  /**
   * Fail loudly at the read that would otherwise return a confident nothing.
   *
   * The message names the caller's options rather than just the fault, because both are legitimate:
   * walk the graph after awaiting the load, or answer from SQL — which is the reason the load is
   * deferred in the first place.
   */
  private assertMaterialised(op: string): void {
    if (!this.deferred) return;
    throw new Error(
      `🛡️ [Graph] \`${op}\` read a graph that is not materialised, so it would have answered ` +
      `"nothing" rather than failing. Await \`registry.infrastructure.ensureGraphLoaded()\` before ` +
      `walking the graph, or answer from SQL — which is why the load is deferred (todo21#P5).`);
  }

  private nodes: Map<NodeId, ConducksNode> = new Map();
  private outEdges: Map<NodeId, Set<ConducksEdge>> = new Map(); // Forward: source -> edges
  private inEdges: Map<NodeId, Set<ConducksEdge>> = new Map();  // Backward: target -> edges
  private nameIndex: Map<string, Set<NodeId>> = new Map();        // Fast search index (Set for O(1) dedup)
  private metadata: Map<string, string> = new Map();             // Global project metadata (Phase 5.3)
  private compressedMeat: Map<NodeId, Buffer> = new Map();       // VMC: Memory Zip for non-skeleton properties

  /**
   * `getNode` decompresses and re-`JSON.parse`s the same buffer on every call — MEASURED
   * (todo22#P12) at 0 hits on `analyze --force` (the reload it worried about is shallow now, per
   * Phase 12), but 21501 calls landing on only 3945 distinct ids during `prune` — a 5.45x re-decode
   * rate costing 283 of 1480 ms wall time. That redundancy is what this caches, not the meat itself.
   *
   * Bounded rather than a plain memo: VMC's whole point (Phase 12) is keeping decompressed data OFF
   * the heap, and a long-lived caller (the MCP server) can touch every node in the graph over its
   * lifetime, at which point an unbounded cache re-inflates back to pre-VMC memory. A small LRU
   * captures the same-node re-reads a single command makes without holding the whole graph decoded.
   */
  private static readonly MEAT_CACHE_CAPACITY = 2000;
  private meatCache: Map<NodeId, Record<string, unknown>> = new Map();

  /** Evict the least-recently-used entry once the cache is over capacity. */
  private cacheMeat(id: NodeId, meat: Record<string, unknown>): void {
    this.meatCache.delete(id);
    this.meatCache.set(id, meat);
    if (this.meatCache.size > ConducksAdjacencyList.MEAT_CACHE_CAPACITY) {
      const oldest = this.meatCache.keys().next().value;
      if (oldest !== undefined) this.meatCache.delete(oldest);
    }
  }

  /**
   * Two more indexes over the same nodes, because three separate resolvers were each answering
   * "which nodes have this name / live in this file" by scanning EVERY node.
   *
   * `nameIndex` is keyed by the exact spelling, which is what `findNodesByName` wants and is
   * useless to a caller that already lowercased. Rather than change that method's semantics, the
   * lowercase view is its own map. Each costs O(N) in ids that already exist and turns an O(N)
   * scan per lookup into O(1) — for callers that run one lookup per import or per file, that is
   * the difference between O(M x N) and O(M + N).
   *
   * Every index here is maintained in exactly three places — `addNode`, `removeNodes`, `clear` —
   * and an index that misses one of them silently returns wrong answers rather than failing.
   */
  private lowerNameIndex: Map<string, Set<NodeId>> = new Map();
  private filePathIndex: Map<string, Set<NodeId>> = new Map();

  public clear(): void {
    this.nodes.clear();
    this.outEdges.clear();
    this.inEdges.clear();
    this.nameIndex.clear();
    this.lowerNameIndex.clear();
    this.filePathIndex.clear();
    this.metadata.clear();
    this.compressedMeat.clear();
    this.meatCache.clear();
  }

  /**
   * Drop one node's entries from every index.
   *
   * One place, because the indexes are keyed by values that can CHANGE — a rename changes the name
   * key, a moved file changes the path key — so both removal paths (overwrite in `addNode`, purge
   * in `clearFile`) must undo exactly what `addNode` recorded, using the node as it was.
   */
  private unindex(id: NodeId, node: ConducksNode): void {
    const name = node.properties.name;
    if (name) {
      this.nameIndex.get(name)?.delete(id);
      this.lowerNameIndex.get(String(name).toLowerCase())?.delete(id);
    }
    const filePath = node.properties.filePath;
    if (filePath) this.filePathIndex.get(String(filePath).toLowerCase())?.delete(id);
  }

  /** Node ids whose lowercased name matches. O(1) — the caller does its own filtering. */
  public getNodeIdsByLowerName(lowerName: string): ReadonlySet<NodeId> {
    return this.lowerNameIndex.get(lowerName) ?? EMPTY_ID_SET;
  }

  /** Node ids declared in a given file path, matched case-insensitively. O(1). */
  public getNodeIdsByFilePath(filePath: string): ReadonlySet<NodeId> {
    return this.filePathIndex.get(filePath.toLowerCase()) ?? EMPTY_ID_SET;
  }

  /**
   * Adds or updates a node in the graph.
   * If isShallow is true, only structural properties are retained in RAM.
   * 
   * v1.7.0 (VMC): If isShallow is false, we compress the 'Meat' to preserve memory.
   */
  public addNode(node: ConducksNode): void {
    // A graph someone is FILLING is not a deferred one, whoever is filling it.
    //
    // `analyze` defers the load on purpose (it is in `STALENESS_BYPASS`) and then builds the graph
    // from source rather than from the vault — so it legitimately reads a graph nothing loaded.
    // Guarding on the deferral alone conflated that with the real failure and broke 53 tests, which
    // is the useful half of that mistake: the flag has to mean "empty AND nobody is filling it",
    // not "the vault load was skipped".
    this.deferred = false;

    const id = node.id.toLowerCase();
    node.id = id;

    // 1. Structural Skeleton Extraction (Always in RAM)
    const skeletonNode: ConducksNode = {
      id: node.id,
      label: node.label,
      isShallow: node.isShallow ?? false,
      properties: {
        name: node.properties.name,
        filePath: node.properties.filePath,
        kind: node.properties.kind,
        parentname: node.properties.parentname,
        rank: node.properties.rank,
        kineticEnergy: node.properties.kineticEnergy,
        isEntryPoint: node.properties.isEntryPoint,
        isExport: node.properties.isExport,
        canonicalKind: node.properties.canonicalKind,
        canonicalRank: node.properties.canonicalRank,
        // DNA Columns (Oracle Skeleton)
        fingerprint: node.properties.fingerprint,
        parentId: node.properties.parentId,
        unitId: node.properties.unitId,
        rootId: node.properties.rootId ?? undefined,
        namespaceId: node.properties.namespaceId,
        structureId: node.properties.structureId,
        layer_path: node.properties.layer_path,
        range: node.properties.range,
        depth: node.properties.depth,
        risk: node.properties.risk,
        gravity: node.properties.gravity,
        complexity: node.properties.complexity,
        dna: node.properties.dna,
        kinetic: node.properties.kinetic,
        signature: node.properties.signature,
        // The author's own description of this symbol (ADR 0133). On the SKELETON because the
        // skeleton is what survives a vault load and what `saveNodes` reads — a field left out here
        // is harvested correctly, carried through the worker correctly, and then silently dropped at
        // the graph boundary. Measured exactly that way: the join reported `attached: 1` while the
        // `doc` column stayed NULL, which is the same shape as the route columns and `instanceOf`
        // above, both of which cost a debugging session before they were added.
        doc: node.properties.doc,
        docFirstLine: node.properties.docFirstLine,
        // Cross-service HTTP binding reads these, and the skeleton is what survives a load — so
        // omitting them made `bindRouteCircuits` match nothing on any graph that came from the
        // vault rather than straight from a parse (todo22#P15).
        // `const x = new Y()` — the variable's type, read off the declaration (todo29#P3b). On the
        // skeleton because IntraLinker resolves `x.method()` against it, and the skeleton is what
        // survives a vault load: left out, the link worked on a fresh parse and vanished on reload,
        // the same shape as the route columns below.
        instanceOf: node.properties.instanceOf,
        instanceOfCall: node.properties.instanceOfCall,
        declaredReturn: node.properties.declaredReturn ?? (node.properties.dna as any)?.returns,
        objectPaths: node.properties.objectPaths,
        paramTypes: node.properties.paramTypes,
        memberTypes: node.properties.memberTypes,
        isRoute: node.properties.isRoute,
        isRequest: node.properties.isRequest,
        method: node.properties.method,
        path: node.properties.path,
        url: node.properties.url
      }
    };

    // 2. Memory Zip (VMC): Compress the 'Meat' (metadata) if present
    //
    // A cached decompression of the OLD meat must not survive this id being rewritten, whether the
    // rewrite lands new meat (below) or goes shallow and leaves none — either way the cache would
    // otherwise hand a later `getNode` data that no longer matches what `compressedMeat` holds for
    // this id (todo22#P12).
    this.meatCache.delete(id);
    if (!node.isShallow) {
      try {
        const meat = { ...node.properties };
        // Remove skeleton props from meat to avoid redundancy
        delete (meat as any).name;
        delete (meat as any).filePath;
        delete (meat as any).kind;
        delete (meat as any).parentname;
        
        const compressed = zlib.deflateSync(JSON.stringify(meat));
        this.compressedMeat.set(id, compressed);
      } catch (err) {
        console.error(`[Conducks VMC] Compression failed for node ${id}:`, err);
      }
    } else {
      // Pre-existing gap the meat-cache test caught: re-adding an id as shallow left the OLD
      // compressed buffer in place — nothing here ever cleared it — so `getNode` kept handing back
      // meat from before this node went shallow. A shallow node has no meat by definition.
      this.compressedMeat.delete(id);
    }

    // An id can be re-added with a DIFFERENT name or file — a symbol renamed, or a file moved. The
    // indexes are keyed by those values, so the old entries have to go before the new ones land, or
    // the id stays reachable under a name it no longer has. That is not merely stale: `clearFile`
    // reads this index to decide what to purge, so a leftover entry makes a pulse delete nodes that
    // belong to a different file, and the node count silently shifts.
    const previous = this.nodes.get(id);
    if (previous) this.unindex(id, previous);

    // A node is never its own parent. Enforced at the source now (graph-engine's ingest) and
    // preserved across waves by COALESCE on the parentId column — an earlier guard here tried to
    // recover the value from `previous`, which fails because the graph is CLEARED between waves, so
    // it turned 334 self-loops into 384 orphans instead.

    this.nodes.set(id, skeletonNode);

    // 3. Update Fast Search Index
    const name = node.properties.name || '';
    if (name) {
      if (!this.nameIndex.has(name)) this.nameIndex.set(name, new Set());
      this.nameIndex.get(name)!.add(id);

      const lower = name.toLowerCase();
      let lowerSet = this.lowerNameIndex.get(lower);
      if (!lowerSet) { lowerSet = new Set(); this.lowerNameIndex.set(lower, lowerSet); }
      lowerSet.add(id);
    }

    // Keyed LOWERCASE, because `clearFile` matches paths case-insensitively and it is the write
    // path that must not miss anything — an entry left behind after a purge hands out ids for nodes
    // that no longer exist. Readers that need exact-case semantics filter after the lookup.
    const filePath = node.properties.filePath || '';
    if (filePath) {
      const key = filePath.toLowerCase();
      let pathSet = this.filePathIndex.get(key);
      if (!pathSet) { pathSet = new Set(); this.filePathIndex.set(key, pathSet); }
      pathSet.add(id);
    }
  }



  /**
   * Adds a relationship between two nodes.
   * Allows adding edges even if nodes don't exist yet (Neural Binding).
   */
  public addEdge(edge: ConducksEdge): void {
    edge.id = edge.id.toLowerCase();
    edge.sourceId = edge.sourceId.toLowerCase();
    edge.targetId = edge.targetId.toLowerCase();
    // 1. Initialize adjacency sets
    if (!this.outEdges.has(edge.sourceId)) this.outEdges.set(edge.sourceId, new Set());
    if (!this.inEdges.has(edge.targetId)) this.inEdges.set(edge.targetId, new Set());

    const outSet = this.outEdges.get(edge.sourceId)!;
    const inSet = this.inEdges.get(edge.targetId)!;

    // 2. Conducks: ID-Based Idempotency check
    for (const e of outSet) if (e.id === edge.id) return;

    outSet.add(edge);
    inSet.add(edge);

    // Propagate Kinetic Energy during pulse
    this.recalculateGravity(edge.sourceId);
    this.recalculateGravity(edge.targetId);
  }

  /**
   * Checks if an edge exists by ID.
   */
  public hasEdge(edgeId: string): boolean {
    for (const edges of this.outEdges.values()) {
        for (const e of edges) {
            if (e.id === edgeId) return true;
        }
    }
    return false;
  }

  /**
   * Conducks — Surgical Rebinding
   *
   * Moves an edge to a new targetId in the backward index.
   * Essential for neural binding where temporary IDs are resolved to origins.
   */
  public rebindEdgeTarget(edge: ConducksEdge, newTargetId: NodeId): void {
    const oldTargetId = edge.targetId;
    if (oldTargetId === newTargetId) return;

    // 1. Remove from old target's in-set
    const oldInSet = this.inEdges.get(oldTargetId);
    if (oldInSet) {
      oldInSet.delete(edge);
      if (oldInSet.size === 0) this.inEdges.delete(oldTargetId);
    }

    // 2. Update edge property
    edge.targetId = newTargetId;

    // A rebind IS a resolution: the target is now known, so an edge that was written as a guess
    // (ADR 0046 records unresolved call targets at 0.4) is no longer one and must stop reporting
    // itself as low confidence. Only the guessed band is raised — an edge at 0.6 or above was
    // never a give-up and keeps whatever its processor decided.
    if (edge.confidence < 0.6) edge.confidence = 0.85;

    // 3. Add to new target's in-set
    if (!this.inEdges.has(newTargetId)) this.inEdges.set(newTargetId, new Set());
    this.inEdges.get(newTargetId)!.add(edge);
  }

  public clearFile(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') return;
    const targetPath = filePath.toLowerCase();
    
    // 1. Identify "Physical Units" in this file path. 
    // We skip 'NAMESPACE' (Phase 7.2) nodes as they are stable Virtual Containers 
    // that should persist even if specific files within them are being re-indexed.
    // Was a scan and a copy of EVERY node, and this runs once per file being re-indexed — so a
    // pulse over F files cost O(F x N) before any parsing happened. The index answers it directly,
    // and it is keyed lowercase precisely so this comparison stays the one it always was.
    const nodeIds = new Set(this.getNodeIdsByFilePath(targetPath));

    for (const id of nodeIds) {
      // 1. Clean up references in other nodes' sets
      const incoming = this.inEdges.get(id);
      if (incoming) {
        for (const edge of incoming) {
          const outSet = this.outEdges.get(edge.sourceId);
          if (outSet) {
            const toDelete: ConducksEdge[] = [];
            for (const e of outSet) if (e.id === edge.id) toDelete.push(e);
            for (const e of toDelete) outSet.delete(e);
          }
        }
      }

      const outgoing = this.outEdges.get(id);
      if (outgoing) {
        for (const edge of outgoing) {
          const inSet = this.inEdges.get(edge.targetId);
          if (inSet) {
            const toDelete: ConducksEdge[] = [];
            for (const e of inSet) if (e.id === edge.id) toDelete.push(e);
            for (const e of toDelete) inSet.delete(e);
          }
        }
      }

      // 2. Remove the node's own sets
      this.outEdges.delete(id);
      this.inEdges.delete(id);

      // 3. Remove from every index. A removal that forgets one leaves an id pointing at a node
      // that no longer exists, and the resolver then binds an edge to nothing.
      const node = this.nodes.get(id);
      if (node) this.unindex(id, node);

      // 4. Remove Node
      this.nodes.delete(id);

      // A purged id is unreachable through `getNode` regardless (it checks `this.nodes` first), so
      // this is memory hygiene rather than a correctness fix — but it keeps the cache from holding
      // decoded meat for a node that no longer exists.
      this.meatCache.delete(id);
    }
  }

  /**
   * Incremental Gravity Update (Heuristic)
   *
   * Provides a fast, local estimate of importance during indexing.
   * Full PageRank structural alignment occurs during globalRecalculateGravity.
   */
  private recalculateGravity(nodeId: NodeId): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const incoming = (this.inEdges.get(nodeId)?.size || 0);
    const outgoing = (this.outEdges.get(nodeId)?.size || 0);

    // Heuristic: (In * 2) + Out
    const energy = (incoming * 2) + outgoing;
    node.properties.kineticEnergy = energy;

    // Preliminary rank
    node.properties.rank = Math.log10(energy + 1) / 10;
  }

  /**
   * Fetches neighbors in a specific direction.
   */
  /**
   * Find an edge BY ID and retarget it, delegating the index work to `rebindEdgeTarget`.
   *
   * `IntraLinker` returns resolutions as `{id, newTargetId}` — it has the id, not the edge object —
   * and those were applied to the VAULT only, so the in-memory graph kept the unresolved names for
   * every consumer running later in the same pulse.
   *
   * This is a LOOKUP, deliberately not a second implementation: the index bookkeeping lives in
   * `rebindEdgeTarget` and nowhere else. Written as a full copy first, which would have been the
   * sixth duplicate of a predicate this codebase has been consolidating all week — caught because a
   * module note still cited the original.
   *
   * Returns false when no edge carries that id, so a caller cannot read "not found" as "retargeted".
   */
  public retargetEdge(edgeId: string, newTargetId: NodeId): boolean {
    const id = edgeId.toLowerCase();
    for (const [, outSet] of this.outEdges) {
      for (const edge of outSet) {
        if (edge.id !== id) continue;
        this.rebindEdgeTarget(edge, newTargetId.toLowerCase());
        return true;
      }
    }
    return false;
  }

  public getNeighbors(nodeId: NodeId, direction: 'upstream' | 'downstream' = 'downstream', type?: EdgeType): ConducksEdge[] {
    this.assertMaterialised("getNeighbors");
    const normalizedId = nodeId.toLowerCase();
    const edgeSet = direction === 'downstream' ? this.outEdges.get(normalizedId) : this.inEdges.get(normalizedId);
    if (!edgeSet) return [];
    // `type` was DECLARED and never applied — a caller asking for ALIASES got MEMBER_OF and every
    // other edge, in first-insertion order, with no error. Found by an alias walk that followed a
    // containment edge into the directory tree. Every other caller omits the argument, so applying
    // it now changes nothing that already worked.
    return type ? Array.from(edgeSet).filter(e => e.type === type) : Array.from(edgeSet);
  }

  /**
   * Fetches all edges connected to nodes within a specific file.
   */
  public getNeighborsByFilePath(filePath: string, direction: 'upstream' | 'downstream'): Array<{ targetPath: string, edge: ConducksEdge }> {
    const fileEdges: Array<{ targetPath: string, edge: ConducksEdge }> = [];
    // Was `Array.from(this.nodes.values()).filter(...)` — a full scan AND a full copy of every node
    // in the graph, on every call. `cochange-engine` calls this twice per candidate pair, so the
    // cost was O(pairs x N) in time and O(N) in garbage per call. The index answers it directly.
    for (const nodeId of this.getNodeIdsByFilePath(filePath)) {
      // The index is case-insensitive; this method always compared paths exactly, so the exact
      // check is kept rather than quietly widening what counts as "in this file".
      if (this.nodes.get(nodeId)?.properties.filePath !== filePath) continue;
      const neighbors = this.getNeighbors(nodeId, direction);
      for (const edge of neighbors) {
        const targetId = direction === 'downstream' ? edge.targetId : edge.sourceId;
        const targetNode = this.nodes.get(targetId);
        if (targetNode && targetNode.properties.filePath !== filePath) {
          fileEdges.push({ targetPath: targetNode.properties.filePath, edge });
        }
      }
    }
    return fileEdges;
  }

  /**
   * Recursive BFS traversal to calculate "Blast Radius" (Impact Analysis).
   */
  public traverseUpstream(startId: NodeId, maxDepth: number = 5): Map<NodeId, number> {
    return GraphTraversal.traverseUpstream(this, startId, maxDepth);
  }

  /**
   * Conducks — Kinetic A* Search
   *
   * High-precision pathfinding between symbols using structural heuristics.
   */
  public traverseAStar(startId: NodeId, targetId: NodeId, heuristic?: (n: ConducksNode) => number): NodeId[] {
    return GraphTraversal.traverseAStar(this, startId, targetId, heuristic);
  }

  /**
   * Retrieves a node by ID (Case-Insensitive).
   * 
   * v1.7.0 (VMC): Hydrates the node with 'Meat' (properties) from the compressed store.
   */
  public getNode(nodeId: NodeId): ConducksNode | undefined {
    this.assertMaterialised("getNode");
    const id = nodeId.toLowerCase();
    const skeleton = this.nodes.get(id);
    if (!skeleton) return undefined;

    const compressed = this.compressedMeat.get(id);
    if (compressed) {
      // Decompress once per id and reuse from the LRU on repeat reads — MEASURED (todo22#P12) at a
      // 5.45x re-decode rate for the same ids on `prune` (21501 calls landing on 3945 distinct
      // nodes). `analyze --force` never reaches this branch at all (0 of 7306 `getNode` calls hit
      // meat), because Phase 12 made the mid-pulse reload shallow — this cache is for `explain`,
      // `diff`, `rename` and `prune`, which still load with meat and call `getNode` in loops.
      let meat = this.meatCache.get(id);
      if (!meat) {
        let decoded: Record<string, unknown>;
        try {
          decoded = JSON.parse(zlib.inflateSync(compressed).toString());
        } catch (err) {
          throw new Error(`Decompression failed for node ${id}: ${err}`);
        }
        meat = decoded;
        this.cacheMeat(id, meat);
      }
      return {
        ...skeleton,
        isShallow: false,
        properties: {
          ...skeleton.properties,
          ...meat
        }
      };
    }

    return skeleton;
  }


  /**
   * Checks if a node exists (Case-Insensitive).
   */
  public hasNode(nodeId: NodeId): boolean {
    this.assertMaterialised("hasNode");
    return this.nodes.has(nodeId.toLowerCase());
  }

  public getAllNodes(): IterableIterator<ConducksNode> {
    this.assertMaterialised("getAllNodes");
    return this.nodes.values();
  }

  public getNodesMap(): Map<NodeId, ConducksNode> {
    this.assertMaterialised("getNodesMap");
    return this.nodes;
  }

  public getOutEdgesMap(): Map<NodeId, Set<ConducksEdge>> {
    return this.outEdges;
  }

  public setMetadata(key: string, value: string): void {
    this.metadata.set(key, value);
  }

  public getMetadata(key: string): string | undefined {
    return this.metadata.get(key);
  }

  public getAllMetadata(): Map<string, string> {
    return this.metadata;
  }

  /**
   * Conducks — Structural Synapse Retrieval
   * 
   * Fetches the complete set of edges from the Synapse Graph.
   */
  public getAllEdges(): ConducksEdge[] {
    this.assertMaterialised("getAllEdges");
    const edges: ConducksEdge[] = [];
    for (const edgeSet of this.outEdges.values()) {
      edges.push(...Array.from(edgeSet));
    }
    return edges;
  }

  /**
   * High-fidelity structural search.
   * Performs O(1) exact lookup, falling back to O(N) fuzzy resonance if needed.
   */
  public findNodesByName(name: string): ConducksNode[] {
    const query = name.toLowerCase();

    // 1. Check Fast Index (Exact)
    const exactIds = this.nameIndex.get(name);
    if (exactIds && exactIds.size > 0) {
      return [...exactIds].map(id => this.nodes.get(id)!).filter(Boolean);
    }

    // 2. Fuzzy / Case-Insensitive Resonance (Fallback)
    const fuzzyMatches: ConducksNode[] = [];
    for (const node of this.nodes.values()) {
      const nodeName = node.properties.name?.toLowerCase() || '';
      const nodeLabel = node.label?.toLowerCase() || '';
      if (nodeName.includes(query) || nodeLabel.includes(query)) {
        fuzzyMatches.push(node);
      }
      if (fuzzyMatches.length >= 20) break;
    }

    return fuzzyMatches;
  }

  /**
   * Conducks — Kinetic Symbol Resolver
   *
   * Returns the specific architectural symbol (function, class, module)
   * enclosing a given line number within a file.
   *
   * FIX 4 (macOS Path Case-Sensitivity):
   * chokidar on macOS/HFS+ can emit paths with different casing than what is
   * stored in the graph (e.g. the OS returns "src/Core/engine.ts" but the
   * graph stored "src/core/engine.ts"). The original implementation used a
   * simple `.toLowerCase()` on both sides — which is correct — but only on
   * the *outer* filter. The sort comparator and the module-label fallback
   * `find()` call were also using the raw `filePath` argument, causing
   * `.filter()` to silently return an empty array and skip symbol resolution.
   *
   * The fix normalises the incoming filePath once at the top of the method
   * and reuses that single canonical value everywhere inside.
   */
  public findSymbolAtLine(filePath: string, line: number): ConducksNode | undefined {
    if (!filePath || typeof filePath !== 'string') return undefined;
    // FIX 4: Normalise once — all comparisons below use this canonical value.
    const targetPath = filePath.toLowerCase();
    const nodesInFile = Array.from(this.nodes.values())
      .filter(n => {
        const path = n.properties.filePath;
        return path && path.toLowerCase() === targetPath;
      });

    // Sort by smallest range (innermost scope) first
    nodesInFile.sort((a, b) => {
      const aRange = (a as any).originalRange || a.properties.range;
      const bRange = (b as any).originalRange || b.properties.range;
      if (!aRange || !bRange) return 0;
      return (aRange.end.line - aRange.start.line) - (bRange.end.line - bRange.start.line);
    });

    for (const node of nodesInFile) {
      const range = (node as any).originalRange || node.properties.range;
      if (range && line >= range.start.line && line <= range.end.line) {
        // Exclude generic 'module' nodes if more specific symbols exist
        if (node.label === 'module' && nodesInFile.length > 1) continue;
        return node;
      }
    }

    // Fallback: Return the module node if no specific symbol matches the line.
    // nodesInFile is already filtered to the correct (normalised) path,
    // so this find() is safe and consistent with the outer filter.
    return nodesInFile.find(n => n.label === 'module');
  }

  public get stats() {
    const degrees = Array.from(this.outEdges.values()).map(s => s.size);
    degrees.sort((a, b) => a - b);
    const median = degrees.length > 0 ? degrees[Math.floor(degrees.length / 2)] : 0;

    const nodeCount = this.nodes.size;
    const edgeCount = degrees.reduce((sum, d) => sum + d, 0);

    return {
      nodeCount,
      edgeCount,
      medianDegree: median,
      density: nodeCount > 0 ? (edgeCount / nodeCount) : 0
    };
  }

  /**
   * Detects all Strongly Connected Components (SCCs) using Tarjan's algorithm.
   * Linear time complexity: O(V + E).
   */
  public detectCycles(options: { ignoreTypes?: string[], ignoreTypeOnly?: boolean, onlyTypes?: Set<string> } = {}): NodeId[][] {
    return CycleDetector.detect(this, options);
  }
}