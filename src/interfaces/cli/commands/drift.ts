import fs from "node:fs";
import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Drift Command 🕵️‍♂️
 * 
 * Detects structural decay and risk velocity between analysis pulses.
 */
export class DriftCommand implements ConducksCommand {
  public id = "drift";
  public description = "Analyze architectural drift between structural pulses";
  public usage = "conducks drift [prevPulseId]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    // The dispatcher ALSO reads the first positional as the target root, so `conducks drift <path>`
    // used to pass the path in here as a pulse id — the run then reported "check that node_history
    // holds rows for pulse /private/tmp/...". A pulse id is `pulse_<ms>_<suffix>`; anything that
    // is a directory on disk is the caller retargeting the project, not naming a pulse.
    const positional = args.find(a => !a.startsWith('--'));
    const looksLikeAPath = !!positional && (positional.includes('/') || fs.existsSync(positional));
    const prevPulseId = looksLikeAPath ? undefined : positional;

    try {
      console.log(`\n\x1b[1m--- 🕵️‍♂️ Conducks Architectural Drift Analysis ---\x1b[0m`);
      const result = await registry.evolution.compare(prevPulseId);

      // A VERDICT THAT WAS NOT REACHED IS NOT A PASS. `INSUFFICIENT_DATA` and `UNAVAILABLE` mean the
      // comparison could not be made — `conducks drift pulse_nope` printed "no drift verdict was
      // reached" and exited 0, so a script could not tell it from "stable". `DECAYING` still exits 0
      // because decay is an ANSWER, and this command reports rather than gates (ADR 0127).
      if (result.status === 'INSUFFICIENT_DATA' || result.status === 'UNAVAILABLE') {
        console.log(`⚠️  \x1b[33m${result.message}\x1b[0m`);
        process.exitCode = 1;
        return;
      }

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
      process.exit(1);
    } finally {
      await closePersistence(registry);
    }
  }
}
