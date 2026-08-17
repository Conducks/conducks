import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList, StructuralRanker } from '@/lib/core/graph/index.js';

/**
 * `gravity` ranks every answer conducks gives, and `isEntryPoint` is the first question a reader
 * asks of an unfamiliar codebase. Both come from this file, which sat at 16% branch coverage.
 *
 * That is the worst place in core to be unmeasured. Gravity is not displayed as a number anyone
 * checks — it decides ORDER, so a wrong value reorders results silently and there is nothing on
 * screen to disagree with. `symbol-resolution` even uses it as a tie-break, so it can pick which
 * symbol a bare name resolves to.
 *
 * `detectEntryPoints` carries three rules, each with a measured failure written beside it (ADR 0113).
 * Every one of those failures is a case here, because a rule with a recorded reason and no test is a
 * rule that can be rewritten back to the version that failed.
 */
const node = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id, label: kind as any,
  properties: { name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: kind, ...extra } as any,
});

const imports = (from: string, to: string) => ({
  id: `${from}->${to}`, sourceId: from, targetId: to,
  type: 'IMPORTS' as any, confidence: 1, properties: {} as any,
});

const build = (nodes: any[], edges: any[] = []): ConducksAdjacencyList => {
  const g = new ConducksAdjacencyList();
  nodes.forEach(n => g.addNode(n));
  edges.forEach(e => g.addEdge(e));
  return g;
};

const grav = (g: ConducksAdjacencyList, id: string) =>
  Number(g.getNode(id)!.properties.gravity ?? 0);

describe('calculateGravity — importance flows along edges', () => {
  it('ranks a widely-imported node above one nothing imports', () => {
    // The whole claim of PageRank in one case. If this inverts, every ranked answer inverts.
    const g = build([
      node('/p/hub.ts::hub', 'STRUCTURE'),
      node('/p/lonely.ts::lonely', 'STRUCTURE'),
      node('/p/a.ts::a', 'STRUCTURE'),
      node('/p/b.ts::b', 'STRUCTURE'),
    ], [
      imports('/p/a.ts::a', '/p/hub.ts::hub'),
      imports('/p/b.ts::b', '/p/hub.ts::hub'),
    ]);

    StructuralRanker.calculateGravity(g);

    expect(grav(g, '/p/hub.ts::hub')).toBeGreaterThan(grav(g, '/p/lonely.ts::lonely'));
  });

  it('gives every ANCHOR a rank, and a non-anchor zero', () => {
    // Only STRUCTURE, BEHAVIOR, INFRA, modules and units are anchors. An ATOM is not — ranking local
    // variables against architecture is what made the entry-point list 603 nodes long.
    const g = build([node('/p/a.ts::thing', 'STRUCTURE'), node('/p/a.ts::x', 'ATOM')]);

    StructuralRanker.calculateGravity(g);

    expect(grav(g, '/p/a.ts::thing')).toBeGreaterThan(0);
    expect(grav(g, '/p/a.ts::x')).toBe(0);
  });

  it('answers for an empty graph rather than throwing', () => {
    expect(() => StructuralRanker.calculateGravity(new ConducksAdjacencyList())).not.toThrow();
  });

  it('answers when NO node is an anchor', () => {
    // A graph of nothing but atoms has no architecture to rank. The guard is what stops a division
    // by an anchor count of zero.
    const g = build([node('/p/a.ts::x', 'ATOM')]);
    expect(() => StructuralRanker.calculateGravity(g)).not.toThrow();
    expect(grav(g, '/p/a.ts::x')).toBe(0);
  });

  it('terminates on a cycle instead of diverging', () => {
    const g = build([
      node('/p/a.ts::a', 'STRUCTURE'),
      node('/p/b.ts::b', 'STRUCTURE'),
    ], [imports('/p/a.ts::a', '/p/b.ts::b'), imports('/p/b.ts::b', '/p/a.ts::a')]);

    StructuralRanker.calculateGravity(g);

    // Symmetric cycle, so both ends must agree — and both must be finite.
    expect(grav(g, '/p/a.ts::a')).toBeCloseTo(grav(g, '/p/b.ts::b'), 6);
    expect(Number.isFinite(grav(g, '/p/a.ts::a'))).toBe(true);
  });

  it('CONSERVES total rank when the graph is full of sinks', () => {
    // A node with no outgoing anchor edges is a sink, and its rank has nowhere to go. The sinkRank
    // term redistributes that mass; without it, the mass LEAKS every iteration and the whole
    // distribution decays toward the teleport floor.
    //
    // Asserting `> 0` on each node — which this case did first — proves nothing: the
    // `(1 - damping) / AN` term keeps every rank positive whether the sink mass is redistributed or
    // thrown away, so the mutation that deleted the term passed. The property that actually
    // distinguishes them is the TOTAL, which must stay at 1.
    const g = build([
      node('/p/a.ts::a', 'STRUCTURE'),
      node('/p/s1.ts::s1', 'STRUCTURE'),
      node('/p/s2.ts::s2', 'STRUCTURE'),
      node('/p/s3.ts::s3', 'STRUCTURE'),
    ], [imports('/p/a.ts::a', '/p/s1.ts::s1')]);

    StructuralRanker.calculateGravity(g);

    const total = ['/p/a.ts::a', '/p/s1.ts::s1', '/p/s2.ts::s2', '/p/s3.ts::s3']
      .reduce((sum, id) => sum + grav(g, id), 0);

    expect(total).toBeCloseTo(1, 5);
  });
});

describe('detectEntryPoints — rule 1, a route is served rather than called', () => {
  it('flags a route BEHAVIOR', () => {
    const g = build([node('/p/api.ts::GET', 'BEHAVIOR', { isRoute: true })]);
    StructuralRanker.detectEntryPoints(g);

    const n = g.getNode('/p/api.ts::get')!;
    expect(n.properties.isEntryPoint).toBe(true);
    expect(n.properties.entryReason).toBe('route');
  });

  it('does not flag a route inside a test tree', () => {
    const g = build([node('/p/tests/api.ts::GET', 'BEHAVIOR', { isRoute: true })]);
    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/tests/api.ts::get')!.properties.isEntryPoint).toBe(false);
  });
});

describe('detectEntryPoints — rule 2, a conventional filename, UNIT only', () => {
  it('flags main.py', () => {
    const g = build([node('/p/main.py::unit', 'UNIT')]);
    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/main.py::unit')!.properties.entryReason).toBe('entry-filename');
  });

  it('does NOT flag a bare index.ts', () => {
    // Deliberately absent from the list: a barrel is the most common file in a TypeScript project
    // and is never where execution starts. Including it flagged 25 files here, none an entry.
    const g = build([node('/p/index.ts::unit', 'UNIT')]);
    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/index.ts::unit')!.properties.isEntryPoint).toBe(false);
  });

  it('does NOT flag a non-UNIT that merely shares the name', () => {
    // The defect ADR 0113 records: the old rules tested the NAME and never the KIND, so 203 ATOMs
    // called `start`, `cmd` or `server` and 3 DIRECTORIES called `cli` were reported as entries.
    const g = build([
      node('/p/x.ts::server', 'ATOM', { filePath: '/p/server.ts' }),
      node('/p/cli::dir', 'DIRECTORY', { filePath: '/p/cli.ts' }),
    ]);
    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/x.ts::server')!.properties.isEntryPoint).toBe(false);
    expect(g.getNode('/p/cli::dir')!.properties.isEntryPoint).toBe(false);
  });

  it('does not flag a conventional name under scripts/', () => {
    const g = build([node('/p/scripts/app.ts::unit', 'UNIT')]);
    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/scripts/app.ts::unit')!.properties.isEntryPoint).toBe(false);
  });
});

describe('detectEntryPoints — rule 3, a root module, and the test importer that hid one', () => {
  it('flags a UNIT nothing imports that imports something', () => {
    const g = build([
      node('/p/bin.ts::unit', 'UNIT'),
      node('/p/lib.ts::unit', 'UNIT'),
    ], [imports('/p/bin.ts::unit', '/p/lib.ts::unit')]);

    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/bin.ts::unit')!.properties.entryReason).toBe('root-module');
  });

  it('a TEST importing it does NOT make it non-entry', () => {
    // The measured failure: this repository's own bin is imported by three test files, `importedBy`
    // was 3, the rule never fired, and the one real entry point went unreported. `prune` asks "is
    // this used", where a test IS a consumer; `entry` asks "is this where the program starts", where
    // a test importer says nothing. Same edges, opposite rule (ADR 0113).
    const g = build([
      node('/p/bin.ts::unit', 'UNIT'),
      node('/p/lib.ts::unit', 'UNIT'),
      node('/p/tests/bin.test.ts::unit', 'UNIT'),
    ], [
      imports('/p/bin.ts::unit', '/p/lib.ts::unit'),
      imports('/p/tests/bin.test.ts::unit', '/p/bin.ts::unit'),
    ]);

    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/bin.ts::unit')!.properties.entryReason).toBe('root-module');
  });

  it('a REAL importer does make it non-entry', () => {
    // The counter-test. Without it, ignoring test importers could become ignoring all importers.
    const g = build([
      node('/p/bin.ts::unit', 'UNIT'),
      node('/p/lib.ts::unit', 'UNIT'),
      node('/p/other.ts::unit', 'UNIT'),
    ], [
      imports('/p/bin.ts::unit', '/p/lib.ts::unit'),
      imports('/p/other.ts::unit', '/p/bin.ts::unit'),
    ]);

    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/bin.ts::unit')!.properties.isEntryPoint).toBe(false);
  });

  it('a leaf that imports NOTHING is not an entry', () => {
    const g = build([node('/p/leaf.ts::unit', 'UNIT')]);
    StructuralRanker.detectEntryPoints(g);
    expect(g.getNode('/p/leaf.ts::unit')!.properties.isEntryPoint).toBe(false);
  });
});

describe('the flag does not LATCH', () => {
  it('clears isEntryPoint and its reason when a node stops qualifying', () => {
    // The old rule ended `if (props.isEntryPoint) isEntry = true`, so a node flagged once stayed
    // flagged forever: a symbol that later gained callers remained an "entry point" across every
    // subsequent pulse, and the flag could only ever grow.
    const g = build([
      node('/p/bin.ts::unit', 'UNIT', { isEntryPoint: true, entryReason: 'root-module' }),
      node('/p/lib.ts::unit', 'UNIT'),
      node('/p/other.ts::unit', 'UNIT'),
    ], [
      imports('/p/bin.ts::unit', '/p/lib.ts::unit'),
      imports('/p/other.ts::unit', '/p/bin.ts::unit'),
    ]);

    StructuralRanker.detectEntryPoints(g);

    const n = g.getNode('/p/bin.ts::unit')!;
    expect(n.properties.isEntryPoint).toBe(false);
    expect(n.properties.entryReason).toBeUndefined();
  });
});

/**
 * A UNIT is an anchor, and for a long time it was not.
 *
 * The filter names `unit` and `module` as anchors, but compared them in lower case while `label` is
 * assigned from `canonicalKind` at ingest and is therefore `UNIT`. The clause matched nothing, and
 * every file-level node in every project was excluded from ranking — measured on this repository:
 * 968 UNIT nodes, gravity 0, column sum 0.
 *
 * It hid behind a second field. `entry` sorts on `properties.rank`, which lives in the metadata blob
 * rather than the `gravity` column, and the blob still held a plausible value from an older pulse.
 * The command printed a sensible-looking ranking while the column beside it was zero — two names for
 * one number, persisted by two routes, disagreeing. Neither was checked against the other.
 */
describe('a UNIT is an anchor', () => {
  it('ranks units, and the imported one ranks higher', () => {
    const g = build([
      node('/p/a.ts::unit', 'UNIT'),
      node('/p/b.ts::unit', 'UNIT'),
    ], [imports('/p/a.ts::unit', '/p/b.ts::unit')]);

    StructuralRanker.calculateGravity(g);

    expect(grav(g, '/p/b.ts::unit')).toBeGreaterThan(grav(g, '/p/a.ts::unit'));
    expect(grav(g, '/p/a.ts::unit') + grav(g, '/p/b.ts::unit')).toBeCloseTo(1, 5);
  });

  it('writes `rank` and `gravity` to the SAME value, because they are one number', () => {
    // The two-names-one-number trap, pinned. They are assigned together and read separately —
    // `entry` reads `rank`, the vault column stores `gravity` — so nothing but this notices if they
    // ever diverge again.
    const g = build([node('/p/a.ts::unit', 'UNIT')]);
    StructuralRanker.calculateGravity(g);

    const props = g.getNode('/p/a.ts::unit')!.properties as Record<string, unknown>;
    expect(props.rank).toBe(props.gravity);
  });

  it('matches the label whatever its case', () => {
    const g = build([node('/p/a.ts::m', 'MODULE'), node('/p/b.ts::m', 'STRUCTURE')]);
    StructuralRanker.calculateGravity(g);
    expect(grav(g, '/p/a.ts::m')).toBeGreaterThan(0);
  });
});
