import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Guard Command 🛡️ 🏺 🟦
 * 
 * Enforces structural integrity by blocking commits that introduce significant decay.
 */
export class GuardCommand implements ConducksCommand {
  public id = "guard";
  public description = "Enforce structural stability via regression thresholds";
  public usage = "conducks guard [--threshold=N] [--force]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const thresholdArg = args.find(a => a.startsWith("--threshold="));
    const threshold = thresholdArg ? parseFloat(thresholdArg.split("=")[1]) : 0.1;
    const force = args.includes("--force");

    const logger = registry.infrastructure.logger;

    try {
      // 1. Optional Analysis Pulse (Directly via registry)
      if (force) {
        logger.info('🛡️ [Guard] Pre-guard synchronization started...');
        await registry.analyze.full();
        logger.info('🛡️ [Guard] Pulse recorded.');
      }

      // 2. Layer-contract check (ADR 0005) — Clean-Architecture boundaries via sentinel rules
      logger.info('🛡️ [Guard] Checking layer boundaries...');
      const ruleReport = (registry.audit as any).rules() as { violations: Array<{ ruleId: string; severity: string; message: string }> };
      const layerViolations = ruleReport.violations.filter(v => v.ruleId === 'layer_boundaries');

      // Other enabled sentinel rules (cycles, rank inversions) are surfaced as findings, not
      // hard-blocked here — they are tracked separately and predate the layer split.
      //
      // Reported BEFORE the layer gate exits, deliberately. Exiting first hid this line whenever
      // the contract was violated, so a reader who most needed the full picture — the build is
      // already red — was the one reader who never saw whether 0 or 400 other findings sat behind
      // it. A gate that hides its own scope cannot be trusted to have checked everything.
      const otherErrors = ruleReport.violations.filter(v => v.ruleId !== 'layer_boundaries');
      if (otherErrors.length > 0) {
        const byRule: Record<string, number> = {};
        for (const v of otherErrors) byRule[v.ruleId] = (byRule[v.ruleId] || 0) + 1;
        console.log('⚠️  Other structural findings (pre-existing, tracked): ' +
          Object.entries(byRule).map(([k, n]) => `${k}=${n}`).join(', '));
      }

      // The layer contract is the hard gate — it's the one this guard was built to enforce.
      if (layerViolations.length > 0) {
        console.error('\n❌ Layer contract violated (ADR 0005):');
        for (const v of layerViolations) console.error(`  - ${v.message}`);
        console.error(`\n${layerViolations.length} illegal cross-layer dependency(ies). Blocked.`);
        process.exit(1);
      }
      console.log('✅ Layer contract clean.');

      // 3. Structural Regression Scan
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
        // Not blocking is not the same as passing. `shouldBlock` returns block:false both for a
        // clean comparison and for one it could not make (ADR 0044), and prefixing a green tick to
        // "NOT ASSESSED" reproduced the exact failure that ADR fixes, one layer up.
        console.log('\n' + (status.message.includes('NOT ASSESSED') ? status.message : '✅ ' + status.message));
        if (status.risk > 0) {
          console.log(`- Minor decay detected: ${status.risk.toFixed(3)} (Acceptable)`);
        }
        console.log('🛡️  Structural resonance is within safe limits.');
        process.exit(0);
      }
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed
      await closePersistence(registry);
    }
  }
}
