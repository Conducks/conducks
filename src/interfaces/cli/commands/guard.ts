import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Guard Command 🛡️ 🏺 🟦
 * 
 * Enforces structural integrity by blocking commits that introduce significant decay.
 */
export class GuardCommand implements ConducksCommand {
  public id = "guard";
  public description = "Enforce structural stability via regression thresholds";
  public usage = "conducks guard [--threshold N]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const thresholdArg = args.find(a => a.startsWith("--threshold="));
    const threshold = thresholdArg ? parseFloat(thresholdArg.split("=")[1]) : 0.1;
    const force = args.includes("--force");

    try {
      // 1. Optional Analysis Pulse (Directly via registry)
      if (force) {
        logger.info('🛡️ [Guard] Pre-guard synchronization started...');
        await registry.analyze.full();
        logger.info('🛡️ [Guard] Pulse recorded.');
      }

      // 2. Structural Regression Scan
      logger.info(`🛡️ [Guard] Scanning structural delta (Threshold: ${threshold})...`);
      const status = await registry.audit.guard(threshold);

      if (status.block) {
        console.error('\n' + status.message);
        console.error('--- Critical Hotspots ---');
        status.hotspots.forEach((h: any) => {
          console.error(`- [REJECT] ${h.name} (${h.file}) -> Risk: ${h.velocity.toFixed(3)}`);
        });
        console.error('\n❌ Architectural regression detected. Blocked.');
        process.exit(1);
      } else {
        console.log('\n✅ ' + status.message);
        if (status.risk > 0) {
          console.log(`- Minor decay detected: ${status.risk.toFixed(3)} (Acceptable)`);
        }
        console.log('🛡️  Structural resonance is within safe limits.');
        process.exit(0);
      }
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed
      await registry.infrastructure.persistence.close();
    }
  }
}
