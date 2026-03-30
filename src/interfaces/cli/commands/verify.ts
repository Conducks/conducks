import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { ConducksSentinel } from "@/lib/domain/governance/sentinel.js";
import fs from "node:fs/promises";

/**
 * Conducks — Verify Command
 */
export class VerifyCommand implements ConducksCommand {
  public id = "verify";
  public description = "Verify project resonance and health";
  public usage = "registry verify";

  public async execute(_args: string[], _persistence: any): Promise<void> {
    console.log("\x1b[35m[Conducks Verify] Auditing Structural Integrity...\x1b[0m");

    const sentinel = new ConducksSentinel();
    const rules = JSON.parse(await fs.readFile("config/sentinel.json", "utf-8").catch(() => "[]"));
    const report = await sentinel.validate(registry.intelligence.graph.getGraph() as any, rules);

    if (report.success) {
      console.log("\x1b[32m✅ System Resonance confirmed.\x1b[0m");
    } else {
      console.log("\x1b[31m❌ Structural issues detected:\x1b[0m");
      report.violations.forEach((v: any) => console.log(`  - [${v.ruleId}] ${v.nodeId}: ${v.message}`));
      process.exit(1);
    }
  }
}
