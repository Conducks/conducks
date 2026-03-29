import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { ConducksSentinel } from "../../../lib/core/policy/sentinel.js";
import { FederatedLinker } from "../../../lib/core/graph/linker-federated.js";
import fs from "node:fs/promises";

/**
 * Conducks — Verify Command
 */
export class VerifyCommand implements ApostleCommand {
  public id = "verify";
  public description = "Run structural governance checks";
  public usage = "conducks verify";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    console.log("[Conducks] Verifying Structural Integrity...");
    await persistence.load(conducks.graph.getGraph());
    
    // Hydrate Federated Graphs
    const linker = new FederatedLinker();
    await linker.hydrate(conducks.graph.getGraph());
    
    const sentinel = new ConducksSentinel();
    const rules = JSON.parse(await fs.readFile("sentinel.json", "utf-8"));
    
    const report = await sentinel.validate(conducks.graph.getGraph(), rules);
    
    if (report.success) {
      console.log("✅ Structural Governance Logic PASSED");
    } else {
      console.error("❌ Structural Governance Logic FAILED");
      report.violations.forEach(v => console.error(`- [${v.ruleId}] ${v.nodeId}: ${v.message}`));
      process.exit(1);
    }
  }
}
