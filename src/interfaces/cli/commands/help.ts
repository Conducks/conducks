import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Professional Structural Help Engine (v2.0.0)
 * 
 * Grouped by structural domain for systematic codebase exploration.
 */
export class HelpCommand implements ConducksCommand {
  public id = "help";
  public description = "Show this help message";
  public usage = "conducks --help";

  constructor(private commands: ConducksCommand[]) {}

  public async execute(_args: string[], _persistence: SynapsePersistence): Promise<void> {
    const domains: Record<string, string[]> = {
      "DISCOVERY (Query)": ["analyze", "query", "list", "entry"],
      "LANDSCAPE (Status)": ["status", "link", "resonance", "blueprint"],
      "BEHAVIORAL (Impact)": ["impact", "flows", "trace"],
      "METRICS (Explain)": ["explain", "entropy", "cohesion"],
      "GOVERNANCE (Audit)": ["audit", "advise", "context"],
      "HISTORICAL (Diff)": ["diff"],
      "MUTATIONAL (Rename)": ["rename", "prune", "clean"],
      "VISUAL (Mirror)": ["mirror", "visualize"],
      "SYSTEM (Meta)": ["mcp", "setup", "watch", "record", "bootstrap-docs", "help"]
    };

    console.log(`\n \x1b[1mCONDUCKS — The Structural Intelligence Suite\x1b[0m 💎`);
    console.log(` \x1b[2mStructural Graph Engine for Professional Engineering\x1b[0m\n`);
    console.log(` \x1b[1mUsage:\x1b[0m conducks --<tool> [feature] [options]`);
    console.log(` \x1b[1mExample:\x1b[0m conducks --impact downstream symbolId\n`);

    Object.entries(domains).forEach(([domain, ids]) => {
      console.log(` \x1b[36m\x1b[1m${domain}\x1b[0m`);
      ids.forEach(id => {
        const cmd = this.commands.find(c => c.id === id);
        if (cmd) {
          const padding = " ".repeat(Math.max(2, 14 - cmd.id.length));
          console.log(`   --${cmd.id}\x1b[2m${padding}${cmd.description}\x1b[0m`);
        }
      });
      console.log("");
    });

    console.log(` \x1b[2mRun 'conducks analyze' to synchronize structural resonance before querying.\x1b[0m\n`);
  }
}
