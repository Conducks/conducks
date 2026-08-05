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
  public usage = "conducks help";

  constructor(private commands: ConducksCommand[]) {}

  public async execute(_args: string[], _registry: Registry): Promise<void> {
    const domains: Record<string, { ids: string[]; examples: string[] }> = {
      "DISCOVERY (Query)": {
        ids: ["analyze", "query", "list", "entry"],
        examples: [
          "conducks analyze ./my-project",
          "conducks query \"UserService\" --limit 10",
        ],
      },
      "LANDSCAPE (Status)": {
        ids: ["status", "link", "resonance"],
        examples: [
          "conducks status",
          "conducks status --json",
        ],
      },
      "BEHAVIORAL (Impact)": {
        ids: ["impact", "flows", "trace"],
        examples: [
          "conducks impact UserService --depth 3 --tree",
          "conducks impact parseConfig downstream",
        ],
      },
      "METRICS (Explain)": {
        ids: ["explain", "entropy", "cohesion", "coverage", "coverage-view"],
        examples: [
          "conducks explain UserService",
          "conducks entropy src/services/",
        ],
      },
      "GOVERNANCE (Audit)": {
        ids: ["audit", "arch", "fallback", "advise", "context", "guard", "drift", "ledger", "supply-chain"],
        examples: [
          "conducks audit",
          "conducks context UserService --max-tokens 4000",
        ],
      },
      "HISTORICAL (Diff)": {
        ids: ["diff", "record"],
        examples: [
          "conducks diff --base main --head feature/my-branch",
        ],
      },
      "MUTATIONAL (Rename)": {
        ids: ["rename", "prune", "clean"],
        examples: [
          "conducks rename OldName NewName",
        ],
      },
      "VISUAL (Mirror)": {
        ids: ["mirror"],
        examples: [
          "conducks mirror",
        ],
      },
      "SYSTEM (Meta)": {
        ids: ["mcp", "setup", "uninstall", "doctor", "watch", "monitor", "bootstrap-docs", "docs-lint", "docs-status", "help"],
        examples: [
          "conducks setup",
          "conducks uninstall",
          "conducks doctor",
        ],
      },
    };

    console.log(`\n \x1b[1mCONDUCKS — The Structural Intelligence Suite\x1b[0m 💎`);
    console.log(` \x1b[2mMaximum Fidelity Graph Engine for Professional Engineering\x1b[0m\n`);
    console.log(` \x1b[1mUsage:\x1b[0m conducks <command> [args] [options]`);
    console.log(` \x1b[1mExample:\x1b[0m conducks impact --symbol MyFunction --direction downstream\n`);

    Object.entries(domains).forEach(([domain, { ids }]) => {
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

    // ANYTHING THE MAP FORGOT STILL PRINTS.
    //
    // The groups above are a hardcoded list of ids, and a command absent from it was invisible: 32
    // of 39 were listed, and the seven missing included `docs-lint` — the documented CI gate — and
    // `coverage`, which four ADRs of this sweep were spent fixing. Every one of them worked; none
    // could be found from the tool itself (ADR 0125).
    //
    // Assigning those seven to groups fixes today. This fixes tomorrow: the next command added to
    // the CLI and forgotten here appears under OTHER rather than nowhere, so the failure mode is a
    // slightly untidy help screen instead of a feature nobody knows exists.
    const grouped = new Set(Object.values(domains).flatMap(d => d.ids));
    const ungrouped = this.commands.filter(c => !grouped.has(c.id));
    if (ungrouped.length > 0) {
      console.log(` \x1b[36m\x1b[1mOTHER\x1b[0m`);
      for (const cmd of ungrouped) {
        const padding = " ".repeat(Math.max(2, 16 - cmd.id.length));
        console.log(`   ${cmd.id}\x1b[2m${padding}${cmd.description}\x1b[0m`);
      }
      console.log("");
    }

    console.log(` \x1b[1mEXAMPLES\x1b[0m`);
    console.log(`   \x1b[2mconducks analyze ./my-project\x1b[0m`);
    console.log(`   \x1b[2mconducks query "UserService" --limit 10\x1b[0m`);
    console.log(`   \x1b[2mconducks impact UserService --depth 3 --tree\x1b[0m`);
    console.log(`   \x1b[2mconducks context UserService --max-tokens 4000\x1b[0m`);
    console.log(`   \x1b[2mconducks status --json\x1b[0m`);
    console.log(`   \x1b[2mconducks doctor\x1b[0m`);
    console.log(`   \x1b[2mconducks uninstall\x1b[0m`);
    console.log("");

    console.log(` \x1b[2mRun 'conducks analyze' to synchronize structural resonance before querying.\x1b[0m`);
    // Not a repo-relative path: the tarball ships only [build, config, LICENSE, README.md], so a
    // globally installed conducks has no docs/ to point at (todo16 Phase 2).
    console.log(` \x1b[2mDetailed Documentation: https://github.com/Conducks/conducks#readme\x1b[0m\n`);
  }
}
