import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Prune Command
 */
export class PruneCommand implements ConducksCommand {
  public id = "prune";
  public description = "Identify unused exports and dead code";
  public usage = "registry prune";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(registry.query.graph.getGraph());
    const findings = registry.explain.prune();
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
