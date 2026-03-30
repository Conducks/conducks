import { ConducksCommand } from "@/interfaces/cli/command.js";
import { ConducksWatcher } from "@/lib/domain/evolution/watcher.js";
import { registry } from "@/registry/index.js";
import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Watch Command
 */
export class WatchCommand implements ConducksCommand {
  public id = "watch";
  public description = "Start real-time monitoring of structural shifts";
  public usage = "registry watch";

  public async execute(args: string[], persistence: DuckDbPersistence): Promise<void> {
    await persistence.load(registry.intelligence.graph.getGraph());
    const watcher = new ConducksWatcher(process.cwd(), registry.intelligence.graph as any, { persistence });
    watcher.start();
  }
}
