import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Flows Command (Behavioral Processes)
 */
export class FlowsCommand implements ConducksCommand {
  public id = "flows";
  public description = "List behavioral processes across the Synapse";
  public usage = "conducks flows [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    await syncGraph(registry);

    const processes = registry.kinetic.getProcesses();
    // A flow of ONE symbol is not a flow, and hiding it silently meant a project whose flows were
    // all single-member printed a heading and nothing — indistinguishable from having none. The
    // count of what was hidden is stated instead (ADR 0115).
    const shown = Object.entries(processes).filter(([, m]) => (m as string[]).length >= 2);
    const hidden = Object.keys(processes).length - shown.length;

    if (useJson) {
      process.stdout.write(JSON.stringify(
        shown.map(([name, members]) => ({ name, symbols: members as string[] })), null, 2) + '\n');
      return;
    }

    console.log("\x1b[1m--- 🌊 Behavioral Processes ---\x1b[0m");
    if (shown.length === 0) {
      console.log(hidden > 0
        ? `No multi-symbol flows. ${hidden} single-symbol flow(s) were not shown.`
        : "No behavioral flows detected.");
      return;
    }

    for (const [name, members] of shown) {
      const list = members as string[];
      console.log(`\x1b[35m- ${name} Flow (${list.length} symbols)\x1b[0m`);
      list.slice(0, 5).forEach((m: string) => console.log(`  └─ ${m}`));
      if (list.length > 5) console.log(`  ... and ${list.length - 5} more`);
    }
  }
}
