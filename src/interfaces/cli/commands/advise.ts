import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Advise Command
 */
export class AdviseCommand implements ConducksCommand {
  public id = "advise";
  public description = "Get architectural recommendations";
  public usage = "registry advise";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    try {
      await persistence.load(registry.intelligence.graph.getGraph());
      const advice = await registry.governance.advise();
      console.log(`\n\x1b[1m--- 💎 Conducks Architecture Advisor ---\x1b[0m`);

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
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await persistence.close();
    }
  }
}
