import { Conducks } from "../src/conducks-core.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

describe("Phase 3.1: Structural Complexity (Cyclomatic Signal)", () => {
  let conducks: Conducks;

  beforeEach(async () => {
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch {}
    conducks = new Conducks();
  });

  test("Complexity Engine: Should accurately count Python branch points", async () => {
    const complexSource = `
def complex_function(x):
    if x > 10:          # 2 (Base 1 + if)
        for i in range(x): # 3 (+ for)
            if i % 2 == 0: # 4 (+ if)
                print(i)
            elif i % 3 == 0: # 5 (+ elif)
                print("three")
            else:
                pass
    else:               # (else doesn't increment)
        try:            # 6 (+ try)
            while x > 0: # 7 (+ while)
                x -= 1
        except Exception: # 8 (+ except)
            pass
    return x
`;

    const mockFiles = [{ path: "complex.py", source: complexSource }];

    await conducks.pulse(mockFiles);
    const graph = conducks.graph.getGraph();

    const node = graph.getNode("complex.py::complex_function");
    expect(node).toBeDefined();
    
    // Expected branches: if, for, if, elif, try, while, except = 7 branch points
    // complexity = 1 (base) + 7 = 8
    expect(node!.properties.complexity).toBe(8);
  });

  test("Risk Score: Complex symbols should surface in advisor even with low gravity", async () => {
    // This function has high complexity but NO incoming calls (low PageRank)
    const complexSource = `
def high_complexity_orphan():
    if 1: pass
    if 2: pass
    if 3: pass
    if 4: pass
    if 5: pass
    if 6: pass
    if 7: pass
    if 8: pass
    if 9: pass
    if 10: pass
    if 11: pass
    if 12: pass
    if 13: pass
    if 14: pass
    if 15: pass
    if 16: pass
    if 17: pass
    if 18: pass
`;
    // Complexity = 1 + 18 = 19. nComplexity = 19/20 = 0.95. risk = 0.5 * 0.95 = 0.475 > 0.4.

    const mockFiles = [{ path: "risk.py", source: complexSource }];

    await conducks.pulse(mockFiles);
    
    const advice = await conducks.advise();
    const riskAdvice = advice.find(a => a.message.includes("High Risk Symbols"));
    
    expect(riskAdvice).toBeDefined();
    expect(riskAdvice!.nodes.some((n: any) => n.includes("high_complexity_orphan"))).toBe(true);
  });
});
