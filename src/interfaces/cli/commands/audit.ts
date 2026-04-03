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

  public async execute(args: string[], registry: Registry): Promise<void> {
    const historyArg = args.find(a => a.startsWith("--history"));
    
    if (historyArg) {
      const windowStr = historyArg.includes("=") ? historyArg.split("=")[1] : "5";
      const window = parseInt(windowStr) || 5;
      
      console.log(`\x1b[35m[Conducks Audit] Archeological Scan (Window: ${window} pulses)...\x1b[0m`);
      const result = await registry.evolution.audit(window);
      
      if (result.status === 'INSUFFICIENT_DATA') {
        console.log(`\x1b[33m⚠️  ${result.message}\x1b[0m`);
        return;
      }
      
      console.log(`\x1b[32m✅ Audit complete over ${result.window_size} pulses.\x1b[0m`);
      if (result.hotspots.length > 0) {
        console.log(`\n\x1b[31m🔥 Longitudinal Hotspots (Consistent Decay):\x1b[0m`);
        result.hotspots.forEach(h => {
          console.log(`  - ${h.name} (${h.file}) -> Avg Velocity: ${h.avg_velocity.toFixed(3)} [${h.trend}]`);
        });
      } else {
        console.log(`\x1b[32m✅ No consistent structural decay patterns found.\x1b[0m`);
      }
      return;
    }

    console.log("\x1b[35m[Conducks Audit] Auditing Core Structural Integrity...\x1b[0m");

    const sentinel = new ConducksSentinel();
    const rules = JSON.parse(await fs.readFile("config/sentinel.json", "utf-8").catch(() => "[]"));
    const report = await sentinel.validate(registry.query.graph.getGraph() as any, rules);

    if (report.success) {
      console.log("\x1b[32m✅ Static Governance confirmed.\x1b[0m");
    } else {
      console.log("\x1b[31m❌ Structural issues detected:\x1b[0m");
      report.violations.forEach((v: any) => console.log(`  - [${v.ruleId}] ${v.nodeId}: ${v.message}`));
      process.exit(1);
    }
  }
}
