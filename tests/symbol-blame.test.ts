import { Conducks } from "../src/conducks-core.js";
import { chronicle } from "../lib/core/git/chronicle-interface.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONDUCKS_DIR = path.resolve(__dirname, "../.conducks");

describe("Sprint 3.A: Symbol-Level Blame Attribution", () => {
  let conducks: Conducks;

  beforeEach(async () => {
    try { await fs.rm(CONDUCKS_DIR, { recursive: true, force: true }); } catch {}
    conducks = new Conducks();
    jest.clearAllMocks();
  });

  test("Blame Mapping: Should attribute authorship to specific function ranges", async () => {
    const targetFile = "src/mock_blame.py";
    const source = `
def kinetic_function(x):
    return x * 2

class KineticClass:
    def method(self):
        pass
`;

    // Mock blame data for specific lines
    const mockBlame: Record<number, { author: string, timestamp: number }> = {
      2: { author: "apostle@gospel.tech", timestamp: 1711737600 },
      3: { author: "apostle@gospel.tech", timestamp: 1711737600 },
      5: { author: "antigravity@gospel.tech", timestamp: 1711741200 },
      6: { author: "antigravity@gospel.tech", timestamp: 1711741200 },
      7: { author: "antigravity@gospel.tech", timestamp: 1711741200 }
    };

    jest.spyOn(chronicle, "getBlameData").mockResolvedValue(mockBlame);
    jest.spyOn(chronicle, "getCommitResonance").mockResolvedValue({ count: 10, authors: 2 });
    jest.spyOn(chronicle, "getAuthorDistribution").mockResolvedValue({ "apostle@gospel.tech": 5, "antigravity@gospel.tech": 5 });

    const mockFiles = [{ path: targetFile, source }];
    await conducks.pulse(mockFiles);
    
    const graph = conducks.graph.getGraph();
    
    // Check function blame
    const funcNode = graph.getNode(`${targetFile}::kinetic_function`);
    expect(funcNode).toBeDefined();
    expect(funcNode!.properties.primaryAuthor).toBe("apostle@gospel.tech");
    expect(funcNode!.properties.authorCount).toBe(1);
    
    // Check class blame
    const classNode = graph.getNode(`${targetFile}::KineticClass`);
    expect(classNode).toBeDefined();
    expect(classNode!.properties.primaryAuthor).toBe("antigravity@gospel.tech");
    expect(classNode!.properties.authorCount).toBe(1);
    
    console.log(`[Blame Test] Verified symbol-level author attribution via mock.`);
  });
});
