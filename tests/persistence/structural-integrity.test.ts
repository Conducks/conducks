import { registry } from "../../src/registry/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

/**
 * Conducks — Structural Integrity Test Suite 💎
 * 
 * Verifies the mathematical and topological properties of the Gospel Core.
 * Ensures the structural mirror is numerically stable and deterministic.
 * Each test runs in a fully clean state (no DuckDB contamination).
 */
describe("Conducks: Structural Integrity (The Gospel Core)", () => {
  beforeEach(async () => {
    // Conducks: Lazy initialization for wasm/grammars
    await registry.initialize();
    registry.infrastructure.graphEngine.getGraph().clear();
  }, 30000);

  afterAll(async () => {
    // Final cleanup of the .conducks dir if any stray files were created
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch { }
  });

  test("Topological Balance: Total Edge Count Is Stable Across The Graph", async () => {
    const mockFiles = [
      { path: "math/core.py", source: "def add(a, b): return a + b" },
      { path: "math/advanced.py", source: "from math.core import add\ndef square(n): return add(n, n)" }
    ];

    await registry.analysis.pulse(mockFiles);
    const graph = registry.intelligence.graph.getGraph();

    // Count edges from the raw internal maps (source of truth)
    const outEdges = (graph as any).outEdges as Map<string, Set<any>>;
    const inEdges = (graph as any).inEdges as Map<string, Set<any>>;

    let totalOut = 0, totalIn = 0;
    outEdges.forEach(set => { totalOut += set.size; });
    inEdges.forEach(set => { totalIn += set.size; });

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

    await registry.analysis.pulse(mockFiles);
    const graph = registry.intelligence.graph.getGraph();

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

    await registry.analysis.pulse(mockFiles);
    const firstSignature = registry.intelligence.graph.getGraph().stats.edgeCount;
    expect(firstSignature).toBeGreaterThan(0);

    // A second pulse of identical inputs must produce an identical structural signature
    await registry.analysis.pulse(mockFiles);
    expect(registry.intelligence.graph.getGraph().stats.edgeCount).toBe(firstSignature);
  });
});
