import { ConducksAdjacencyList, NodeId } from "../adjacency-list.js";

/**
 * Conducks — Structural Ranking & Anchoring
 * 
 * Implements PageRank-based Gravity analysis and entry point heuristics.
 */
export class StructuralRanker {
  /**
   * High-Fidelity PageRank Convergence
   */
  public static calculateGravity(graph: ConducksAdjacencyList, iterations: number = 30, damping: number = 0.85): void {
    const nodes = Array.from(graph.getAllNodes());
    if (nodes.length === 0) return;

    // 1. Identify Architectural Anchors
    // The label comparison is CASE-INSENSITIVE, and it was not. `label` is assigned from
    // `canonicalKind` at ingest, so it is `UNIT` and `MODULE` in upper case — the lower-case
    // comparisons here matched nothing, and every file-level node in every project was excluded
    // from ranking. Measured on this repository: 968 UNIT nodes, gravity 0, sum 0.
    //
    // It hid behind a second field. `entry` sorts on `properties.rank`, which lives in the metadata
    // blob rather than the `gravity` COLUMN, and the blob kept a plausible-looking value from an
    // older pulse — so the command printed a sensible ranking while the column beside it was zero.
    // Two names for one number, persisted by two routes, disagreeing.
    const anchors = nodes.filter(node => {
      const p = node.properties;
      const ck = p.canonicalKind;
      const label = String(node.label ?? '').toLowerCase();
      return ck === 'STRUCTURE' || ck === 'FUNCTION' || ck === 'BEHAVIOR' || ck === 'INFRA'
        || p.isModule || label === 'module' || label === 'unit';
    });

    const AN = anchors.length;
    if (AN === 0) return;

    let ranks = new Map<NodeId, number>();
    for (const node of anchors) ranks.set(node.id, 1 / AN);

    // 2. Power Iteration
    for (let i = 0; i < iterations; i++) {
      const nextRanks = new Map<NodeId, number>();
      let sinkRank = 0;

      for (const node of anchors) {
        const out = graph.getNeighbors(node.id, 'downstream');
        const archOut = out ? out.filter(e => ranks.has(e.targetId)) : [];
        if (archOut.length === 0) sinkRank += ranks.get(node.id)!;
      }

      for (const node of anchors) {
        let rankSum = 0;
        const incoming = graph.getNeighbors(node.id, 'upstream');
        if (incoming) {
          for (const edge of incoming) {
            if (!ranks.has(edge.sourceId)) continue;
            const srcOut = graph.getNeighbors(edge.sourceId, 'downstream');
            const srcOutDegree = srcOut ? srcOut.filter(e => ranks.has(e.targetId)).length : 1;
            rankSum += ranks.get(edge.sourceId)! / Math.max(1, srcOutDegree);
          }
        }

        const newRank = ((1 - damping) / AN) + damping * (rankSum + (sinkRank / AN));
        nextRanks.set(node.id, newRank);
      }
      ranks = nextRanks;
    }

    // 3. Commit Gravity
    for (const node of nodes) {
      const rank = ranks.get(node.id) || 0;
      node.properties.rank = rank;
      node.properties.gravity = rank;
      node.properties.kineticEnergy = rank * AN;
    }

    // 4. Conducks — Identify Entry Points after importance is known
    this.detectEntryPoints(graph);
  }

  /**
   * Conducks — Entry Point Intelligence
   *
   * An entry point is where EXECUTION begins: a bin script, a server main, a framework route. It is
   * the first thing a reader asks of an unfamiliar codebase, so a wrong answer sends them to the
   * wrong end of the project.
   *
   * Measured on this repository before the rewrite (ADR 0113): **603 nodes flagged**, including 203
   * ATOMs — local variables named `start`, `index`, `cmd`, `server` — and 3 DIRECTORIES named `cli`.
   * The name heuristics tested the NAME and never the KIND, so any symbol sharing a word with the
   * list qualified. Meanwhile the command displayed 12, all of them test files and debug scripts,
   * and the real bin was absent.
   *
   * Three rules, each with a stated reason, and every one restricted to a kind that can actually be
   * an entry:
   *
   *   route     a framework route or handler — served, not called
   *   filename  a UNIT whose basename is a conventional program entry
   *   root      a UNIT nothing in the project imports, and which imports something itself
   *
   * `reason` is recorded on the node so the answer is auditable rather than asserted.
   */
  public static detectEntryPoints(graph: ConducksAdjacencyList): void {
    // Conventional program entries. A BARE `index.ts` is deliberately absent: a barrel is the most
    // common file in a TypeScript project and is never where execution starts — including it flagged
    // 25 files here, none of them an entry.
    const ENTRY_FILES = new Set([
      'main.py', 'app.py', '__main__.py',
      'main.go', 'main.rs', 'main.java', 'main.c', 'main.cpp',
      'server.ts', 'server.js', 'cli.ts', 'cli.js', 'app.ts', 'app.js',
    ]);
    /** A test is never an entry point: nothing imports it BY DESIGN, which is the shape rule 3 reads. */
    const isTest = (f: string) => /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[jt]sx?$/.test(f);
    /** A throwaway script is not the way into a project either. */
    const isScratch = (f: string) => /(^|\/)(scripts?|tools?|examples?|fixtures?)\//.test(f);

    for (const node of graph.getAllNodes()) {
      const props = node.properties;
      const kind = String(props.canonicalKind || node.label || '');
      const file = String(props.filePath || '');
      const basename = file ? file.split('/').pop() || '' : '';

      let isEntry = false;
      let reason = '';

      // 1. A framework ROUTE is served rather than called, so "nothing references it" is its normal
      //    state and it is a genuine way in.
      const looksRoute = node.label === 'route' || !!node.label?.includes('route')
        || !!props?.kind?.includes('route') || props.isRoute === true;
      if (looksRoute && (kind === 'BEHAVIOR' || kind === 'INFRA') && !isTest(file)) {
        isEntry = true; reason = 'route';
      }

      // 2. A conventional entry FILENAME — UNIT only. This is what flagged directories and local
      //    variables: the old test read `name` and `basename` against every node in the graph.
      if (!isEntry && kind === 'UNIT' && ENTRY_FILES.has(basename.toLowerCase())
          && !isTest(file) && !isScratch(file)) {
        isEntry = true; reason = 'entry-filename';
      }

      // 3. A ROOT UNIT: nothing in the project imports it, and it imports something. That is what a
      //    program's starting file looks like — and also what a test file looks like, which is why
      //    tests and scratch scripts are excluded rather than left to rank low.
      if (!isEntry && kind === 'UNIT' && !isTest(file) && !isScratch(file)) {
        // A TEST importing a module does not make it non-entry.
        //
        // The bin of this very repository is imported by three test files, and counting them hid it:
        // `importedBy` was 3, so the rule never fired and the one real entry point in the project
        // went unreported. `prune` asks "is this used", where a test IS a real consumer; `entry`
        // asks "is this where the program starts", where a test importer says nothing at all. Same
        // edges, different question, opposite rule (ADR 0113).
        const importedBy = graph.getNeighbors(node.id, 'upstream')
          .filter(e => e.type === 'IMPORTS')
          .filter(e => {
            const src = graph.getNode(e.sourceId);
            return !isTest(String(src?.properties?.filePath ?? ''));
          }).length;
        const importsOut = graph.getNeighbors(node.id, 'downstream')
          .filter(e => e.type === 'IMPORTS').length;
        if (importedBy === 0 && importsOut > 0) { isEntry = true; reason = 'root-module'; }
      }

      // NO LATCH. The old rule ended `if (props.isEntryPoint) isEntry = true`, so a node flagged once
      // stayed flagged forever — a symbol that later gained callers remained an "entry point" across
      // every subsequent pulse, and the flag could only ever grow.
      node.properties.isEntryPoint = isEntry;
      if (isEntry) props.entryReason = reason; else delete (props as Record<string, unknown>).entryReason;
    }
  }
}
