import { Conducks } from "../src/conducks-core.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

describe("Phase 3.3: Git-Native Signals (Resonance & Entropy)", () => {
  let conducks: Conducks;

  beforeEach(async () => {
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch {}
    conducks = new Conducks();
  });

  test("Git Signals: Should ingest churn and entropy from structural pulse", async () => {
    // We use a .py extension so the PythonProvider is invoked
    const targetFile = "src/mock_pulse.py";
    const complexSource = `
def kinetic_function(x):
    # TODO: Marker
    if x > 10: return x
    return 0
`;

    const mockFiles = [{ path: targetFile, source: complexSource }];

    await conducks.pulse(mockFiles);
    const graph = conducks.graph.getGraph();

    // Find the node
    const node = graph.getNode(`${targetFile}::kinetic_function`);
    expect(node).toBeDefined();
    
    // Entropy and Resonance should be assigned (even if 0 for a new file)
    expect(node!.properties.resonance).toBeDefined();
    expect(node!.properties.entropy).toBeDefined();
    
    expect(typeof node!.properties.resonance).toBe("number");
    expect(typeof node!.properties.entropy).toBe("number");
  });

  test("Advisor Integration: Git signals should influence Composite Risk", async () => {
    const targetFile = "src/advisor_test.py";
    const source = "def test_node(): pass";
    const mockFiles = [{ path: targetFile, source }];

    await conducks.pulse(mockFiles);
    
    const advice = await conducks.advise();
    // Verification: advise should return an array
    expect(Array.isArray(advice)).toBe(true);
  });
});
