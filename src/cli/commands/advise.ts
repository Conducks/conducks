import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Advise Command
 */
export class AdviseCommand implements ApostleCommand {
  public id = "advise";
  public description = "Get architectural recommendations";
  public usage = "conducks advise";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(conducks.graph.getGraph());
    const advice = await conducks.advise();
    console.log(`\n\x1b[1m--- 💎 Apostle Architecture Advisor ---\x1b[0m`);
    
    if (advice.length === 0) {
      console.log(`✅ Structural Integrity is Pristine. No sins detected.`);
      return;
    }
  
    advice.forEach((a: any) => {
      const color = a.level === 'ERROR' ? '\x1b[31m' : a.level === 'WARNING' ? '\x1b[33m' : '\x1b[34m';
      console.log(`${color}- [${a.type}] ${a.message}\x1b[0m`);
      a.nodes.slice(0, 3).forEach((n: string) => console.log(`  └─ ${n}`));
      if (a.nodes.length > 3) console.log(`  ... and ${a.nodes.length - 3} more`);
    });
  }
}
