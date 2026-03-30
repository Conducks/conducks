import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Explain Command (Signal Decomposition)
 * 
 * Provides a premium, detailed breakdown of a symbol's structural risk score.
 */
export class ExplainCommand implements ConducksCommand {
  public id = "explain";
  public description = "Provide a detailed risk signal decomposition for a symbol";
  public usage = "registry explain <symbol_id>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    if (!symbolId) {
      console.error("Usage: registry explain <symbol_id>");
      return;
    }

    await persistence.load(registry.intelligence.graph.getGraph());

    let node = registry.intelligence.graph.getGraph().getNode(symbolId);
    
    // Conducks: Intelligent Fallback Resolve
    if (!registry.intelligence.graph.getGraph().getNode(symbolId)) {
      const results = registry.intelligence.search.search(symbolId, 1);
      if (results.length > 0) {
        node = registry.intelligence.graph.getGraph().getNode(results[0].id);
      }
    }

    if (!node) {
      console.error(`Error: Symbol "${symbolId}" not found in the Synapse.`);
      return;
    }

    const advisor = registry.governance.advisor;
    const b = advisor.calculateRiskBreakdown(node, registry.intelligence.graph.getGraph());

    console.log(`\n\x1b[1m--- 🛡️ Conducks Structural Explanation ---\x1b[0m`);
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
