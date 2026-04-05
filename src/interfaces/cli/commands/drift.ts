import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Drift Command 🕵️‍♂️
 * 
 * Detects structural decay and risk velocity between analysis pulses.
 */
export class DriftCommand implements ConducksCommand {
  public id = "drift";
  public description = "Analyze architectural drift between structural pulses";
  public usage = "registry drift [prevPulseId]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const prevPulseId = args.find(a => !a.startsWith('--'));

    try {
      console.log(`\n\x1b[1m--- 🕵️‍♂️ Conducks Architectural Drift Analysis ---\x1b[0m`);
      const result = await registry.evolution.compare(prevPulseId);

      if (result.status === 'STABLE') {
        console.log(`✅ ${result.message}`);
      } else {
        console.log(`⚠️  \x1b[33m${result.message}\x1b[0m`);
      }

      if (result.summary) {
        console.log(`\nSummary:`);
        console.log(`- Total Symbols: ${result.summary.total_symbols}`);
        console.log(`- Decaying:      \x1b[31m${result.summary.decay_count}\x1b[0m`);
        console.log(`- Improving:     \x1b[32m${result.summary.improvement_count}\x1b[0m`);
        console.log(`- Renamed/Moved: \x1b[35m${result.summary.move_count || 0}\x1b[0m`);
      }

      if (result.moves && result.moves.length > 0) {
        console.log(`\n\x1b[1m📦 Structural Renames & Moves Detected ---\x1b[0m`);
        result.moves.slice(0, 5).forEach((m: any, i: number) => {
          console.log(`${i + 1}. \x1b[35m${m.name}\x1b[0m [${m.file}]`);
          console.log(`   └─ From: ${m.from.split('::').pop()}`);
          console.log(`   └─ To:   ${m.to.split('::').pop()}`);
        });
      }

      if (result.deltas && result.deltas.length > 0) {
        console.log(`\n\x1b[1m🚀 Top Structural Decay Hotspots (Velocity) ---\x1b[0m`);
        result.deltas.filter(d => d.velocity > 0.01).slice(0, 10).forEach((d: any, i: number) => {
          const color = d.velocity > 0.1 ? '\x1b[31m' : '\x1b[33m';
          console.log(`${i + 1}. ${color}${d.name}\x1b[0m [Velocity: ${d.velocity.toFixed(4)}]`);
          console.log(`   └─ Gravity: ${d.gravity_delta > 0 ? '+' : ''}${d.gravity_delta.toFixed(4)} | Complexity: ${d.complexity_delta > 0 ? '+' : ''}${d.complexity_delta}`);
          if (d.isModified) console.log(`   └─ \x1b[34mStructural DNA Shift Detected\x1b[0m`);
        });
      }

    } catch (err: any) {
      console.error(`\x1b[31mError during drift analysis: ${err.message}\x1b[0m`);
    } finally {
      await registry.infrastructure.persistence.close();
    }
  }
}
