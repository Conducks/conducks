import { ConducksGraph } from "@/lib/core/graph/index.js";
import { DeadCodeAnalyzer, type Finding } from "@/lib/domain/evolution/index.js";
import { chronicle } from "@/lib/core/git/index.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/index.js";

/**
 * Conducks — Metrics Domain Service
 * 
 * Centralized logic for structural risk assessment, 
 * author distribution analysis, and structural similarity.
 */
export class MetricsService {

  constructor(
    private graph: ConducksGraph,
    private deadCode: DeadCodeAnalyzer
  ) {}

  /**
   * Calculates Shannon Entropy and normalized risk for a symbol's ownership.
   */
  public async calculateEntropy(symbolId: string) {
    const g = this.graph.getGraph();
    const node = g.getNode(symbolId);
    if (!node || !node.properties.filePath) return { entropy: 0, risk: 0, authorCount: 0 };

    const distribution = await chronicle.getAuthorDistribution(node.properties.filePath);
    // A null distribution is "git could not be read", not "one careful owner". Reporting risk 0
    // for it made the least-known file look like the safest one on the board.
    if (distribution === null) {
      return { entropy: 0, risk: 0, authorCount: 0, unavailable: true };
    }
    const authors = Object.keys(distribution);
    const entropy = calculateShannonEntropy(distribution);
    const risk = normalizeEntropyRisk(entropy, authors.length || 1);

    return { entropy, risk, authorCount: authors.length };
  }

  /**
   * `calculateCompositeRisk` lived here TOO, and was dead — zero callers, zero tests.
   *
   * The registry wires risk to `ConducksCore.calculateCompositeRisk`, and the two returned
   * DIFFERENT SHAPES under one name: this one `{ gravity: { value, weight } }`, the live one plain
   * numbers. `explain` was written against this shape and served by the other, so every signal it
   * printed read `NaN` while the composite score above them was correct (ADR 0105).
   *
   * Deleted rather than reconciled: a second implementation nothing calls is not a fallback, it is
   * a second answer waiting to be picked by accident. Its `factors` logic — the only thing it had
   * that the live one lacked — moved to `ConducksCore` rather than being lost with it (ADR 0112).
   */

  /**
   * Calculates the structural similarity (Jaccard) between two symbols.
   */
  /**
   * How much two symbols' downstream neighbourhoods overlap, weighted by how RARE each shared
   * neighbour is.
   *
   * Plain Jaccard over raw neighbours ORDERED TWO PAIRS BACKWARDS on the scraper subject:
   * `Clusterer._calculate_complexity` vs `Clusterer._check_spatial_consistency` — same class, both
   * called from `cluster()` — scored 17.39%, while `_calculate_complexity` vs
   * `validators.validate_phone`, a different package with no relationship at all, scored 21.43%.
   *
   * Reading the two neighbour sets shows why, and both causes are mechanical:
   *
   *   - SHARED BUILT-INS dominate the intersection. The unrelated pair's whole overlap was
   *     `global::str`, `global::re`, `global::len`. Every Python function calls `len`, so counting it
   *     as evidence of kinship makes every pair of functions look alike.
   *   - EACH SYMBOL'S OWN LOCALS inflate the union and can never intersect. `_check_spatial_consistency`
   *     contributes six local variables nothing else can share, so the denominator grows with the
   *     size of the function — punishing the bigger one for being bigger.
   *
   * So locals are dropped outright (they are pure denominator), and every remaining neighbour is
   * weighted by inverse document frequency: `log(N / times-this-neighbour-is-reached)`. A neighbour
   * the whole graph touches contributes ~0; one only these two touch contributes nearly its full
   * weight. That is the reasoning a reader applies — "they both call `len`" is not a fact about these
   * two functions, "they both belong to `Clusterer`" is.
   *
   * No threshold and no allow-list: rarity is measured from the graph in front of it, so a name that
   * is ubiquitous in one codebase and rare in another is treated correctly in both.
   */
  public getLevelSimilarity(sourceId: string, targetId: string): number {
    const g = this.graph.getGraph();

    /**
     * Neighbours that could be shared AND mean something when they are.
     *
     * Two exclusions, each for its own reason:
     *   - a symbol's own LOCALS can never intersect, so they are pure denominator;
     *   - the BUILT-IN vocabularies (`global::len`, `typing::list`) are reached by nearly every
     *     symbol in the graph. IDF alone shrinks them but does not silence them — measured, they
     *     still carried 22.55% of the score for a pair with no relationship at all, because in a
     *     5,000-node graph even a neighbour used 200 times keeps a third of a rare one's weight.
     *     "They both call `len`" is not a fact about two functions in any codebase.
     */
    const keep = (id: string): boolean => {
      if (id.startsWith(`${sourceId}.`) || id.startsWith(`${targetId}.`)) return false;
      const ns = id.split('::')[0].toLowerCase();
      return ns !== 'global' && ns !== 'typing' && ns !== 'unresolved';
    };

    const sN = new Set(g.getNeighbors(sourceId, 'downstream').map((n: any) => String(n.targetId)).filter(keep));
    const tN = new Set(g.getNeighbors(targetId, 'downstream').map((n: any) => String(n.targetId)).filter(keep));

    if (sN.size === 0 && tN.size === 0) return 0;

    const freq = this.neighbourFrequency(g);
    const total = Math.max(freq.size, 1);
    const weight = (id: string): number => Math.log(total / Math.max(freq.get(id) ?? 1, 1)) + 1e-9;

    let shared = 0;
    let all = 0;
    for (const id of new Set<string>([...sN, ...tN])) {
      const w = weight(id);
      all += w;
      if (sN.has(id) && tN.has(id)) shared += w;
    }
    return all > 0 ? shared / all : 0;
  }

  /** How many distinct symbols reach each node. Rebuilt only when the graph's edge count changes. */
  private freqCache: { size: number; map: Map<string, number> } | null = null;
  private neighbourFrequency(g: any): Map<string, number> {
    const edges = g.getAllEdges();
    if (this.freqCache && this.freqCache.size === edges.length) return this.freqCache.map;
    const seen = new Set<string>();
    const map = new Map<string, number>();
    for (const e of edges) {
      const key = `${e.sourceId}\u0000${e.targetId}`;
      if (seen.has(key)) continue;   // one symbol reaching one neighbour twice is one voice
      seen.add(key);
      const t = String(e.targetId);
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    this.freqCache = { size: edges.length, map };
    return map;
  }

  /**
   * Identifies orphan symbols with no incoming edges.
   */
  public prune() {
    return this.deadCode.analyze(this.graph.getGraph());
  }

}

// `Finding` is NOT re-exported. It is evolution's type — this feature CONSUMES it, and nothing
// outside takes it from here. Republishing another feature's vocabulary is the same rule 5b
// mistake as republishing its class, which this door was also doing until a commit ago.
// `DeadCodeAnalyzer` is NOT re-exported here. It belongs to `evolution`, and republishing another
// feature's class makes this door a dependency edge onto that one (rule 5b) — the same thing
// `intelligence` was doing with `FederatedLinker`. The registry takes it from evolution directly.
