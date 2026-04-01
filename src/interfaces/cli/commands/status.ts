import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import path from "node:path";

/**
 * Conducks — Status Command
 */
export class StatusCommand implements ConducksCommand {
  public id = "status";
  public description = "Show health and symbol counts";
  public usage = "registry status [path]";

  public async execute(args: string[], injectedPersistence: SynapsePersistence): Promise<void> {
    const pathArg = args.find(a => !a.startsWith('--'));
    const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();

    // Conducks — Align Persistence with the Target Project Path
    // Use injected persistence if provided (aids unit testing), 
    // otherwise create new persistence for the target path.
    const persistence: SynapsePersistence = injectedPersistence || new GraphPersistence(targetPath);

    (registry as any).persistence = persistence;
    chronicle.setProjectDir(targetPath);

    try {
      // Ensure gravity is fresh based on the architectural anchors
      (registry.infrastructure.graphEngine as any).resonate();

      const status = registry.audit.status();
      const graph = registry.query.graph.getGraph();

      console.log("\x1b[1m--- 🏺 Graph Status ---\x1b[0m");
      console.log(`- Nodes:   ${status.stats.nodeCount}`);
      console.log(`- Edges:   ${status.stats.edgeCount}`);
      console.log(`- Density: ${status.stats.density.toFixed(6)} relationships/symbol`);
      console.log(`- Status:  ${status.status}`);

      if (status.staleness.stale) {
        console.log(`- \x1b[33mStaleness: Stale (${status.staleness.commitsBehind} commits behind HEAD)\x1b[0m`);
      } else {
        console.log(`- \x1b[32mStaleness: Synchronized\x1b[0m`);
      }

      const nodes = Array.from(graph.getAllNodes());
      const topGravity = nodes
        .filter(n => !n.properties.isTest)
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 10);

      console.log(`\n\x1b[1m--- 🚀 Top Structural Hotspots (PageRank Gravity) ---\x1b[0m`);
      topGravity.forEach((n, i) => {
        console.log(`${i + 1}. \x1b[35m${n.id}\x1b[0m [Gravity: ${(n.properties.rank || 0).toFixed(4)}]`);
      });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await persistence.close();
    }
  }
}
