import { ApostleCommand } from "../command.js";
import { Conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { ApostleAdvisor } from "../../../lib/product/analysis/advisor.js";

/**
 * Conducks — Explain Command (Signal Decomposition)
 * 
 * Provides a premium, detailed breakdown of a symbol's structural risk score.
 */
export class ExplainCommand implements ApostleCommand {
  public id = "explain";
  public description = "Provide a detailed risk signal decomposition for a symbol";
  public usage = "conducks explain <symbol_id>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.error("Usage: conducks explain <symbol_id>");
      return;
    }

    const conducks = new Conducks();
    await persistence.load(conducks.graph.getGraph());
    
    const node = conducks.graph.getGraph().getNode(symbolId);
    if (!node) {
      console.error(`Error: Symbol "${symbolId}" not found in the Synapse.`);
      return;
    }

    const advisor = new ApostleAdvisor();
    const b = advisor.calculateRiskBreakdown(node, conducks.graph.getGraph());
    
    console.log(`\n\x1b[1m--- 🛡️ Apostle Structural Explanation ---\x1b[0m`);
    console.log(`Symbol: \x1b[35m${node.properties.name}\x1b[0m (${node.label})`);
    console.log(`Path:   ${node.properties.filePath}`);
    console.log(`\nRisk Score: \x1b[1m${b.total.toFixed(2)}\x1b[0m / 1.0`);
    
    const markers = node.properties.debtMarkers || [];
    const debtStr = markers.length > 0 ? ` (${markers.join(', ')})` : '';

    console.log(`\x1b[1mSignal Decomposition:\x1b[0m`);
    console.log(`  ├── \x1b[36mgravity:\x1b[0m     ${b.gravity.toFixed(2)}  (centrality rank: ${node.properties.rank?.toFixed(4) || 0})`);
    console.log(`  ├── \x1b[36mcomplexity:\x1b[0m  ${b.complexity.toFixed(2)}  (cyclomatic density: ${node.properties.complexity || 1})`);
    console.log(`  ├── \x1b[36mfan-out:\x1b[0m     ${b.fanOut.toFixed(2)}  (outgoing structural dependencies)`);
    console.log(`  ├── \x1b[36mdebt:\x1b[0m        ${b.debt.toFixed(2)} ${debtStr}`);
    console.log(`  ├── \x1b[36mchurn:\x1b[0m       ${b.churn.toFixed(2)}  (resonance / temporal frequency)`);
    console.log(`  └── \x1b[36mentropy:\x1b[0m     ${b.entropy.toFixed(2)}  (authorship fragmentation)`);

    console.log(`\n\x1b[2mStructural resonance detected in ${node.properties.authorCount || 0} authors over ${node.properties.tenureDays || 0} days.\x1b[0m`);
  }
}
