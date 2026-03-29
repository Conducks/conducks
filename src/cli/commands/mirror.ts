import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { ConducksWatcher } from "../../../lib/core/watcher/watcher.js";
import { initGlobalMirror } from "../../../lib/product/discovery/mirror-server.js";

/**
 * Conducks — Mirror Command
 */
export class MirrorCommand implements ApostleCommand {
  public id = "mirror";
  public description = "Start high-fidelity visual explorer";
  public usage = "conducks mirror";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    console.log("\x1b[35m[Conducks] Initializing Visual Dashboard...\x1b[0m");
    
    // 1. Load Graph
    await persistence.load(conducks.graph.getGraph());
    
    // 2. Start Mirror Server
    const server = initGlobalMirror(conducks.graph);
    server.start(3333);
    
    // 3. Start Watcher (Live Connection)
    const watcher = new ConducksWatcher(process.cwd(), conducks.graph as any, { persistence });
    watcher.start();
    
    console.log("\n\x1b[32m✅ Conducks Mirror is LIVE.\x1b[0m");
    console.log("\x1b[34m- Dashboard: http://localhost:3333\x1b[0m");
    console.log("\x1b[33m- Note: Keep this terminal open to maintain the live pulse.\x1b[0m");
  }
}
