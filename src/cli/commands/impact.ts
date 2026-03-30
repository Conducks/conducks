import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Impact Command
 */
export class ImpactCommand implements ApostleCommand {
  public id = "impact";
  public description = "Perform blast radius analysis on a symbol";
  public usage = "conducks impact <symbolId> [direction: upstream|downstream]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    const direction = (args[1] === "downstream" ? "downstream" : "upstream") as "upstream" | "downstream";
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID for impact analysis.");
      return;
    }
    
    await persistence.load(conducks.graph.getGraph());
    
    try {
      const impact = conducks.getImpact(symbolId, direction);
      const composite = await conducks.calculateCompositeRisk(symbolId);

      console.log(`\n\x1b[1m--- Apostle ${direction.toUpperCase()} Impact Report: ${symbolId} ---\x1b[0m`);
      console.log(`\x1b[35mWeighted Impact Coverage:\x1b[0m ${impact.affectedCount} Symbols affected`);
      console.log(`\x1b[35mShortest Weighted Path:\x1b[0m ${impact.affectedNodes[0]?.distance.toFixed(2) || 0}`);
      console.log(`\x1b[35mImpact Score:\x1b[0m ${impact.impactScore}`);
      
      if (composite) {
        console.log(`\n\x1b[1mComposite Risk Breakdown:\x1b[0m`);
        console.log(`\x1b[31mOverall Risk: ${(composite.score * 10).toFixed(2)} / 10.0\x1b[0m`);
        
        const b = composite.breakdown;
        console.log(`- \x1b[33mStructural Gravity (PageRank):\x1b[0m ${(b.gravity.value * 100).toFixed(2)}% (Weight: ${b.gravity.weight})`);
        console.log(`- \x1b[33mOwnership Entropy (Shannon):\x1b[0m ${(b.entropy.value * 100).toFixed(2)}% (Weight: ${b.entropy.weight})`);
        console.log(`- \x1b[33mCode Churn (Commit Density):\x1b[0m ${(b.churn.value * 100).toFixed(2)}% (Weight: ${b.churn.weight})`);
        console.log(`- \x1b[33mStructural Fan-out (Coupling):\x1b[0m ${(b.fanOut.value * 100).toFixed(2)}% (Weight: ${b.fanOut.weight})`);
      }

    } catch (err) {
      console.error(`Impact Analysis Error: ${(err as Error).message}`);
    }
  }
}
