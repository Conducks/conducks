import { Conducks } from "../../src/conducks-core.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

/**
 * Apostle v6 — Structural Integrity Test Suite 💎
 * 
 * Verifies the mathematical and topological properties of the Gospel Core.
 * Ensures the structural mirror is numerically stable and deterministic.
 * Each test runs in a fully clean state (no DuckDB contamination).
 */
describe("Apostle v6: Structural Integrity (The Gospel Core)", () => {
  let conducks: Conducks;

  beforeEach(async () => {
    // Unique folder per run to ensure visibility and isolation
    const testId = `test_run_${Date.now()}`;
    const testDir = path.resolve(__dirname, `../.conducks_${testId}`);
    conducks = new Conducks({ baseDir: testDir });
  }, 30000);

  afterEach(async () => {
    // Explicitly drain and close to ensure no leaked connections in Jest
    if ((conducks as any).persistence && typeof (conducks as any).persistence.close === 'function') {
      await (conducks as any).persistence.close();
    }
  });

  afterAll(async () => {
    // Final cleanup of the .conducks dir if any stray files were created
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch {}
  });

  test("Topological Balance: Total Edge Count Is Stable Across The Graph", async () => {
    const mockFiles = [
      { path: "math/core.py", source: "def add(a, b): return a + b" },
      { path: "math/advanced.py", source: "from math.core import add\ndef square(n): return add(n, n)" }
    ];

    await conducks.pulse(mockFiles);
    const graph = conducks.graph.getGraph();

    // Count edges from the raw internal maps (source of truth)
    const outEdges = (graph as any).outEdges as Map<string, Set<any>>;
    const inEdges  = (graph as any).inEdges  as Map<string, Set<any>>;

    let totalOut = 0, totalIn = 0;
    outEdges.forEach(set => { totalOut += set.size; });
    inEdges.forEach(set  => { totalIn  += set.size; });

    // Every edge is stored in exactly one out-set and one in-set
    // so the raw totals MUST always be identical
    expect(totalOut).toBeGreaterThan(0);
    expect(totalOut).toBe(totalIn);
  });

  test("Gravity Stability: PageRank Must Converge — Hub Dominates Spokes", async () => {
    // Hub-and-Spoke: hub.main() is called by 4 independent spokes
    // After resonance, hub::main must have a higher rank than any spoke
    const mockFiles = [
      { path: "/app/hub.py", source: "def main(): pass" },
      { path: "/app/spoke1.py", source: "import hub\ndef do1(): hub.main()" },
      { path: "/app/spoke2.py", source: "import hub\ndef do2(): hub.main()" },
      { path: "/app/spoke3.py", source: "import hub\ndef do3(): hub.main()" },
      { path: "/app/spoke4.py", source: "import hub\ndef do4(): hub.main()" }
    ];

    await conducks.pulse(mockFiles);
    const graph = conducks.graph.getGraph();

    const hubNode = graph.getNode("/app/hub.py::main");
    const spoke1Node = graph.getNode("/app/spoke1.py::do1");

    expect(hubNode).toBeDefined();
    expect(spoke1Node).toBeDefined();
    // Hub must dominate structurally
    expect(hubNode!.properties.rank).toBeGreaterThan(spoke1Node!.properties.rank || 0);
  });

  test("Parallel Determinism: Re-Pulsing The Same Source Yields Identical Edge Count", async () => {
    const mockFiles = [
      { path: "A.py", source: "import B, C" },
      { path: "B.py", source: "import D" },
      { path: "C.py", source: "import D" },
      { path: "D.py", source: "def leaf(): pass" }
    ];

    await conducks.pulse(mockFiles);
    const firstSignature = conducks.graph.getGraph().stats.edgeCount;
    expect(firstSignature).toBeGreaterThan(0);

    // A second pulse of identical inputs must produce an identical structural signature
    await conducks.pulse(mockFiles);
    expect(conducks.graph.getGraph().stats.edgeCount).toBe(firstSignature);
  });
});
