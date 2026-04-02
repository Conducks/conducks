import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { ConducksSentinel } from "@/lib/domain/governance/sentinel.js";
import fs from "node:fs/promises";

/**
 * Conducks — Audit Command (Standardized Taxonomy)
 */
export class AuditCommand implements ConducksCommand {
  public id = "audit";
  public description = "Audit structural integrity and governance";
  public usage = "conducks audit";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    console.log("\x1b[35m[Conducks Audit] Auditing Structural Integrity...\x1b[0m");

    const sentinel = new ConducksSentinel();
    const rules = JSON.parse(await fs.readFile("config/sentinel.json", "utf-8").catch(() => "[]"));
    const report = await sentinel.validate(registry.query.graph.getGraph() as any, rules);

    if (report.success) {
      console.log("\x1b[32m✅ System Integrity confirmed.\x1b[0m");
    } else {
      console.log("\x1b[31m❌ Structural issues detected:\x1b[0m");
      report.violations.forEach((v: any) => console.log(`  - [${v.ruleId}] ${v.nodeId}: ${v.message}`));
      process.exit(1);
    }
  }
}
