import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { GraphPersistence, SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { ChronicleInterface } from "../../../lib/core/git/chronicle-interface.js";
import { FederatedLinker } from "../../../lib/core/graph/linker-federated.js";
import path from "node:path";

/**
 * Conducks — Analyze Command
 * 
 * Pulses the structural stream of the repository.
 */
export class AnalyzeCommand implements ApostleCommand {
  public id = "analyze";
  public description = "Index and pulse a repository structure";
  public usage = "conducks analyze [--staged] [--chronicle]";

  public async execute(args: string[], _persistence: SynapsePersistence): Promise<void> {
    const isVerbose = args.includes('--verbose');
    const isStaged = args.includes('--staged');
    const pathArg = args.find(a => !a.startsWith('--'));
    const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();

    // Apostle v3 — Align Persistence with the Target Project Path
    const persistence = new GraphPersistence(targetPath);
    (conducks as any).persistence = persistence;

    console.log(`\x1b[35m[Conducks] Analyzing Project Structure: ${targetPath}\x1b[0m`);
    const startOverall = performance.now();

    // 1. Digital Reflection via Chronicle Interface (Discovery)
    const discoveryStart = performance.now();
    const voyager = new ChronicleInterface(targetPath);
    const files = await voyager.discoverFiles(isStaged);
    const discoveryTime = performance.now() - discoveryStart;

    if (files.length === 0) {
      console.log("\x1b[33m- No changes found. Graph is stable.\x1b[0m");
      return;
    }

    if (isVerbose) console.log(`\x1b[90m[Audit] Discovery took ${discoveryTime.toFixed(2)}ms (${files.length} units detected)\x1b[0m`);

    // 2. Reflecting structural stream (Consolidated Pulse)
    const reflectionStart = performance.now();
    console.log(`\x1b[36m- Analyzing ${files.length} units from ${isStaged ? 'Index' : 'Workspace'}...\x1b[0m`);
    
    // Apostle v3 Performance Optimization: 
    // Collect all file content and pulse ONCE to avoid redundant worker/WASM init
    const allUnits = [];
    for await (const batch of voyager.streamBatches(files, 500, isStaged)) {
      allUnits.push(...batch);
    }
    
    await conducks.pulse(allUnits);
    const reflectionTime = performance.now() - reflectionStart;
    if (isVerbose) console.log(`\x1b[90m[Audit] Structural Reflection took ${reflectionTime.toFixed(2)}ms\x1b[0m`);

    // 3. Significance Analysis (PageRank)
    const gravityStart = performance.now();
    await conducks.recalculateGravity();
    const gravityTime = performance.now() - gravityStart;
    if (isVerbose) console.log(`\x1b[90m[Audit] Structural Gravity Logic took ${gravityTime.toFixed(2)}ms\x1b[0m`);

    // 4. Hydrate Federated Graphs (Linkage)
    const linkageStart = performance.now();
    const linker = new FederatedLinker();
    await linker.hydrate(conducks.graph.getGraph());
    const linkageTime = performance.now() - linkageStart;
    if (isVerbose) console.log(`\x1b[90m[Audit] Federated Linkage took ${linkageTime.toFixed(2)}ms\x1b[0m`);

    const status = conducks.status();
    console.log("\n\x1b[1m--- 📊 Graph Analysis Result ---\x1b[0m");
    console.log(`\x1b[34m- Symbols (Nodes):   ${status.stats.nodeCount}\x1b[0m`);
    console.log(`\x1b[34m- Relationships (Edges):  ${status.stats.edgeCount}\x1b[0m`);
    console.log(`\x1b[34m- Status:            ${status.status}\x1b[0m`);

    // 4. Auto-Save Persistence
    const persistenceStart = performance.now();
    await persistence.save(conducks.graph.getGraph());
    const persistenceTime = performance.now() - persistenceStart;
    if (isVerbose) console.log(`\x1b[90m[Audit] Database Persistence took ${persistenceTime.toFixed(2)}ms\x1b[0m`);

    const totalTime = performance.now() - startOverall;
    console.log(`\x1b[32m\x1b[1m[Conducks] Pulse Complete in ${(totalTime / 1000).toFixed(2)}s\x1b[0m`);
  }
}
