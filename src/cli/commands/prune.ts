import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Prune Command
 */
export class PruneCommand implements ApostleCommand {
  public id = "prune";
  public description = "Identify unused exports and dead code";
  public usage = "conducks prune";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(conducks.graph.getGraph());
    const findings = conducks.prune();
    console.log(`\n\x1b[1m--- ✂️ Dead Weight Discovery ---\x1b[0m`);
    
    if (findings.length === 0) {
      console.log(`✅ No dead weight detected. All structural elements are in use.`);
    } else {
      findings.forEach((f: any) => {
        const color = f.type === 'UNUSED_EXPORT' ? '\x1b[33m' : '\x1b[31m';
        console.log(`${color}- [${f.type}] ${f.symbol} (${f.file})\x1b[0m`);
        console.log(`  └─ ${f.message}`);
      });
    }
  }
}
