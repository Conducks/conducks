import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { GraphPersistence, SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import path from "node:path";

/**
 * Conducks — Status Command
 */
export class StatusCommand implements ApostleCommand {
  public id = "status";
  public description = "Show health and symbol counts";
  public usage = "conducks status [path]";

  public async execute(args: string[], _persistence: SynapsePersistence): Promise<void> {
    const pathArg = args.find(a => !a.startsWith('--'));
    const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();

    // Apostle v3 — Align Persistence with the Target Project Path
    const persistence = new GraphPersistence(targetPath);
    (conducks as any).persistence = persistence;

    await persistence.load(conducks.graph.getGraph());
    
    // Ensure gravity is fresh based on the architectural anchors
    conducks.recalculateGravity();

    const status = conducks.status();
    const graph = conducks.graph.getGraph();
    
    console.log("\x1b[1m--- 🏺 Graph Status ---\x1b[0m");
    console.log(`- Nodes:   ${status.stats.nodeCount}`);
    console.log(`- Edges:   ${status.stats.edgeCount}`);
    console.log(`- Density: ${status.stats.density.toFixed(6)} relationships/symbol`);
    console.log(`- Status:  ${status.status}`);

    const nodes = Array.from(graph.getAllNodes());
    const topGravity = nodes
      .filter(n => !n.properties.isTest)
      .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
      .slice(0, 10);

    console.log(`\n\x1b[1m--- 🚀 Top Structural Hotspots (PageRank Gravity) ---\x1b[0m`);
    topGravity.forEach((n, i) => {
      console.log(`${i + 1}. \x1b[35m${n.id}\x1b[0m [Gravity: ${(n.properties.rank || 0).toFixed(4)}]`);
    });
  }
}
