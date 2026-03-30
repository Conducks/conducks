import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { GraphPersistence, SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import path from "node:path";

/**
 * Conducks — Entry Command (Apostle v5.1)
 * 
 * Displays primary entry points (CLI, API routes, main functions) 
 * detected in the structural graph, sorted by PageRank gravity.
 */
export class EntryCommand implements ApostleCommand {
  public id = "entry";
  public description = "List detected project entry points (API, CLI, Main)";
  public usage = "conducks entry [path]";

  public async execute(args: string[], _persistence: SynapsePersistence): Promise<void> {
    const pathArg = args.find(a => !a.startsWith('--'));
    const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();

    // Align Persistence with the Target Project Path
    const persistence = new GraphPersistence(targetPath, true); // Read-only is fine
    (conducks as any).persistence = persistence;

    const success = await persistence.load(conducks.graph.getGraph());
    if (!success) {
      console.error(`\x1b[31m[Apostle CLI] Error: No structural index found at ${targetPath}. Run 'conducks analyze' first.\x1b[0m`);
      return;
    }
    
    // Ensure entry point detection is fresh
    conducks.graph.getGraph().detectEntryPoints();

    const graph = conducks.graph.getGraph();
    const nodes = Array.from(graph.getAllNodes());
    
    const entryPoints = nodes
      .filter(n => n.properties.isEntryPoint)
      .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0));

    console.log("\x1b[1m--- 🚪 Project Entry Points (Apostle v5.1) ---\x1b[0m");
    console.log(`- Detected: ${entryPoints.length} anchors found.\n`);

    if (entryPoints.length === 0) {
      console.log("No explicit entry points detected. Heuristics found no 'main', 'app', or routes.");
      console.log("Try running 'conducks analyze --verbose' to see structural orientation.");
      return;
    }

    console.log(`${"ID".padEnd(50)} ${"Kind".padEnd(15)} ${"Gravity".padEnd(10)}`);
    console.log("-".repeat(80));

    entryPoints.forEach(n => {
      const gravity = (n.properties.rank || 0).toFixed(4);
      const kind = n.label || "unknown";
      const id = n.id.length > 47 ? "..." + n.id.slice(-47) : n.id;
      
      console.log(`\x1b[35m${id.padEnd(50)}\x1b[0m ${kind.padEnd(15)} \x1b[33m${gravity.padEnd(10)}\x1b[0m`);
    });
  }
}
