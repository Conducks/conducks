import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { BlueprintGenerator } from "@/lib/domain/governance/blueprint-generator.js";
import { syncGraph, closePersistence } from "@/interfaces/cli/shared/context.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";

/**
 * Conducks — Blueprint Command
 *
 * Flags:
 *   --save          Save current snapshot to .conducks/blueprints/<pulseId>.json
 *   --diff <ref>    Compare current blueprint against snapshot at <ref> (pulseId or HEAD~N)
 */
export class BlueprintCommand implements ConducksCommand {
  public id = "blueprint";
  public description = "Generate structural manifest (blueprint)";
  public usage = "registry blueprint [--save] [--diff <ref>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const saveFlag = args.includes('--save');
    const diffIdx = args.indexOf('--diff');
    const diffRef = diffIdx !== -1 ? args[diffIdx + 1] : null;

    try {
      console.log("[Conducks] Generating Structural Graph...");
      await syncGraph(registry);

      const graph = registry.query.graph.getGraph();
      const generator = new BlueprintGenerator();
      const projectDir = chronicle.getProjectDir();
      const targetPath = await generator.generate(graph, projectDir);
      console.log(`✅ Structural Graph generated at: ${targetPath}`);

      // Build a serialisable snapshot from the graph
      const allNodes = Array.from(graph.getAllNodes()).map(n => n.id);
      const cycles = graph.detectCycles();
      const currentSnapshot = { nodes: allNodes, cycles };

      if (saveFlag) {
        const pulseId = Date.now().toString();
        await generator.saveSnapshot(pulseId, currentSnapshot);
        console.log(`✅ Snapshot saved: .conducks/blueprints/${pulseId}.json`);
      }

      if (diffRef) {
        const baseline = await generator.loadSnapshot(diffRef);
        if (!baseline) {
          console.error(`❌ Snapshot not found: ${diffRef}`);
        } else {
          const diff = generator.diffSnapshots(baseline, currentSnapshot);
          console.log('\n[Blueprint Diff]');
          console.log(`  Nodes added    : ${diff.nodesAdded.length}`);
          console.log(`  Nodes removed  : ${diff.nodesRemoved.length}`);
          console.log(`  Violations added   : ${diff.rankViolationsAdded.length}`);
          console.log(`  Violations resolved: ${diff.rankViolationsRemoved.length}`);
          console.log(`  New cycles     : ${diff.newCycles.length}`);
          console.log(`  Resolved cycles: ${diff.resolvedCycles.length}`);

          if (diff.nodesAdded.length > 0) console.log('  + Added:', diff.nodesAdded.slice(0, 5).join(', ') + (diff.nodesAdded.length > 5 ? ' …' : ''));
          if (diff.nodesRemoved.length > 0) console.log('  - Removed:', diff.nodesRemoved.slice(0, 5).join(', ') + (diff.nodesRemoved.length > 5 ? ' …' : ''));
        }
      }
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await closePersistence(registry);
    }
  }
}
