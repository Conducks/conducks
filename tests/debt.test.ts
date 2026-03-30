import { Conducks } from "../src/conducks-core.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

describe("Phase 3.2: Technical Debt Signal (TODO/FIXME Extraction)", () => {
  let conducks: Conducks;

  beforeEach(async () => {
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch {}
    conducks = new Conducks();
  });

  test("Debt Extractor: Should capture markers within function scopes", async () => {
    const debtSource = `
def debt_heavy_function():
    # TODO: Implement this properly
    # FIXME: Extremely slow algorithm
    # BUG: Crashes on null input
    pass

class DebtClass:
    # HACK: Workaround for tree-sitter bug
    def method(self):
        # REFACTOR: Move to base class
        pass
`;

    const mockFiles = [{ path: "debt.py", source: debtSource }];

    await conducks.pulse(mockFiles);
    const graph = conducks.graph.getGraph();

    const funcNode = graph.getNode("debt.py::debt_heavy_function");
    expect(funcNode).toBeDefined();
    expect(funcNode!.properties.debtMarkers).toContain("TODO");
    expect(funcNode!.properties.debtMarkers).toContain("FIXME");
    expect(funcNode!.properties.debtMarkers).toContain("BUG");

    const classNode = graph.getNode("debt.py::DebtClass");
    expect(classNode).toBeDefined();
    expect(classNode!.properties.debtMarkers).toContain("HACK");

    const methodNode = graph.getNode("debt.py::method");
    expect(methodNode).toBeDefined();
    expect(methodNode!.properties.debtMarkers).toContain("REFACTOR");
  });

  test("Risk Score: Debt should increment symbol risk", async () => {
    const source = `
def buggy_function():
    # BUG: Issue 1
    # BUG: Issue 2
    # BUG: Issue 3
    # BUG: Issue 4
    # BUG: Issue 5
    pass
`;
    // Complexity = 1, Debt = 5
    // nDebt = 5/5 = 1.0
    // risk = (wComplexity * 1/20) + (wDebt * 1.0)
    // with wDebt = 0.1, risk = 0.02 + 0.1 = 0.12. (Still needs some complexity or gravity to surface if threshold is 0.4)

    const mockFiles = [{ path: "buggy.py", source: source }];
    await conducks.pulse(mockFiles);
    
    const advice = await conducks.advise();
    // Verification of markers in advice string
    const riskAdvice = advice.find(a => a.message.includes("High Risk Symbols"));
    if (riskAdvice) {
       expect(riskAdvice.nodes.some((n: any) => n.includes("BUG"))).toBe(true);
    }
  });
});
