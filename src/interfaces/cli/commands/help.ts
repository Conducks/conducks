import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

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

  public async execute(_args: string[], _registry: Registry): Promise<void> {
    const domains: Record<string, string[]> = {
      "DISCOVERY (Query)": ["analyze", "query", "list", "entry"],
      "LANDSCAPE (Status)": ["status", "link", "resonance", "blueprint"],
      "BEHAVIORAL (Impact)": ["impact", "flows", "trace"],
      "METRICS (Explain)": ["explain", "entropy", "cohesion"],
      "GOVERNANCE (Audit)": ["audit", "advise", "context", "guard", "drift"],
      "HISTORICAL (Diff)": ["diff", "record"],
      "MUTATIONAL (Rename)": ["rename", "prune", "clean"],
      "VISUAL (Mirror)": ["mirror", "visualize"],
      "SYSTEM (Meta)": ["mcp", "setup", "watch", "context-gen", "bootstrap-docs", "help"]
    };

    console.log(`\n \x1b[1mCONDUCKS — The Structural Intelligence Suite\x1b[0m 💎`);
    console.log(` \x1b[2mMaximum Fidelity Graph Engine for Professional Engineering\x1b[0m\n`);
    console.log(` \x1b[1mUsage:\x1b[0m conducks <command> [args] [options]`);
    console.log(` \x1b[1mExample:\x1b[0m conducks impact --symbol MyFunction --direction downstream\n`);

    Object.entries(domains).forEach(([domain, ids]) => {
      console.log(` \x1b[36m\x1b[1m${domain}\x1b[0m`);
      ids.forEach(id => {
        const cmd = this.commands.find(c => c.id === id);
        if (cmd) {
          const padding = " ".repeat(Math.max(2, 16 - cmd.id.length));
          console.log(`   ${cmd.id}\x1b[2m${padding}${cmd.description}\x1b[0m`);
        }
      });
      console.log("");
    });

    console.log(` \x1b[2mRun 'conducks analyze' to synchronize structural resonance before querying.\x1b[0m`);
    console.log(` \x1b[2mDetailed Documentation: ./docs/mechanics.md\x1b[0m\n`);
  }
}
