import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { ConducksWatcher } from "../../../lib/core/watcher/watcher.js";

/**
 * Conducks — Watch Command
 */
export class WatchCommand implements ApostleCommand {
  public id = "watch";
  public description = "Start real-time monitoring of structural shifts";
  public usage = "conducks watch";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(conducks.graph.getGraph());
    const watcher = new ConducksWatcher(process.cwd(), conducks.graph as any, { persistence });
    watcher.start();
  }
}
