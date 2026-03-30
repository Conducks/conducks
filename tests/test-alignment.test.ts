import { Conducks } from "../src/conducks-core.js";
import { chronicle } from "../lib/core/git/chronicle-interface.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

describe("Sprint 3.A: Test Coverage Intelligence", () => {
  let conducks: Conducks;

  beforeEach(async () => {
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch {}
    conducks = new Conducks();
    jest.clearAllMocks();
  });

  test("Test Aligner: Should correctly map test-to-production coverage", async () => {
    jest.spyOn(chronicle, "getBlameData").mockResolvedValue({});
    jest.spyOn(chronicle, "getCommitResonance").mockResolvedValue({ count: 1, authors: 1 });
    jest.spyOn(chronicle, "getAuthorDistribution").mockResolvedValue({ "test@gospel.tech": 1 });

    const prodSource = `
def multiply(a, b):
    return a * b

class Calculator:
    def add(self, a, b):
        return a + b
`;

    const testSource = `
import product # Mock import
from product import multiply, Calculator

def test_calculator():
    c = Calculator()
    c.add(1, 2)
    multiply(2, 3)
`;

    const mockFiles = [
      { path: "project/product.py", source: prodSource },
      { path: "project/test_product.py", source: testSource } // Note the 'test_' prefix
    ];

    await conducks.pulse(mockFiles);
    const graph = conducks.graph.getGraph();

    // Verify 'multiply' node
    const multiplyNode = graph.getNode("project/product.py::multiply");
    expect(multiplyNode).toBeDefined();
    expect(multiplyNode!.properties.coveredBy).toContain("project/test_product.py");

    // Verify 'add' node
    const addNode = graph.getNode("project/product.py::add");
    expect(addNode).toBeDefined();
    expect(addNode!.properties.coveredBy).toContain("project/test_product.py");
    
    console.log(`[Coverage Test] Symbols coveredBy test_product.py verified.`);
  });
});
