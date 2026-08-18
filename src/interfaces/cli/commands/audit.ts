import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import { displayMessage } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Audit Command (Standardized Taxonomy)
 */
export class AuditCommand implements ConducksCommand {
  public id = "audit";
  public description = "Audit structural integrity and governance";
  public usage = "conducks audit [--history=<window>] [--json]";

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

    const useJson = args.includes('--json');
    if (!useJson) console.log("\x1b[35m[Conducks Audit] Auditing Core Structural Integrity...\x1b[0m");

    const auditData = await (registry.audit as any).audit();

    // Findings are built in the domain layer, where an id is the only handle it has. Rewriting the
    // ids at the PRINT boundary keeps them ids in the data and paths in the output (ADR 0132) —
    // three per circular finding, ~270 characters of identical absolute prefix on one line.
    const auditRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
    const msg = (m: string) => displayMessage(String(m ?? ''), auditRoot);

    // 1. Structural Orphans (Conducks Refactoring Alerts) 🏺
    if (!useJson && auditData.stats.orphans > 0) {
      console.log(`\n\x1b[31m💣 [Refactoring Alert] ${auditData.stats.orphans} Orphaned Synapses Detected:\x1b[0m`);
      // Display first 10 for brevity, user can use GQL for more
      auditData.violations
        .filter((v: any) => v.type === 'REFACTOR')
        .slice(0, 10)
        .forEach((v: any) => console.log(`  - ${msg(v.message)}`));
      if (auditData.stats.orphans > 10) console.log(`  ... and ${auditData.stats.orphans - 10} more.`);
    }

    // 2. Circular Dependencies
    if (!useJson && auditData.stats.cycles > 0) {
      console.log(`\n\x1b[31m🔄 [Architectural Alert] ${auditData.stats.cycles} Circular Dependencies Detected:\x1b[0m`);
      auditData.violations
        .filter((v: any) => v.type === 'CIRCULAR')
        .forEach((v: any) => console.log(`  - ${msg(v.message)}`));
    }

    // 2a. Mutual-call tangles (ARCH-6) — reported, never a failure. ADR 0017 took these OUT of ARCH-3
    // because a module import cycle and two functions calling each other are different facts; that left
    // them reported nowhere. They are informational: mutual recursion is legal, a knot of six symbols
    // with no entry order is worth a look, and only a human can tell those apart.
    const tangles = (auditData.discoveries || []).filter((d: any) => d.type === 'TANGLE');
    if (!useJson && tangles.length > 0) {
      console.log(`\n\x1b[33m🪢 [Mutual Calls] ${tangles.length} symbol tangle(s) — informational, not a violation:\x1b[0m`);
      tangles.slice(0, 10).forEach((d: any) => console.log(`  - ${msg(d.message)}`));
      if (tangles.length > 10) console.log(`  ... and ${tangles.length - 10} more.`);
    }

    // 2b. Self-imports (ARCH-4) — a file importing/re-exporting from itself (degenerate, not a cycle)
    const selfImports = auditData.violations.filter((v: any) => v.type === 'SELF_IMPORT');
    if (!useJson && selfImports.length > 0) {
      console.log(`\n\x1b[33m♻️  [Self-Import] ${selfImports.length} file(s) import/re-export from themselves:\x1b[0m`);
      selfImports.forEach((v: any) => console.log(`  - ${msg(v.message)}`));
    }

    // 3. Sentinel Static Governance (Rule-based)
    const sentinel = registry.audit.createSentinel();
    const rulesPath = path.join((registry as any).infrastructure?.chronicle?.getProjectDir?.(), 'config/sentinel.json');
    // Read via rulesPath, not a cwd-relative literal: running the CLI from outside the project
    // root used to swallow ENOENT and evaluate an EMPTY rule set, so `audit` reported
    // "Governance confirmed" while checking nothing. Warn rather than pass silently.
    const rules = JSON.parse(await fs.readFile(rulesPath, "utf-8").catch(() => {
      console.warn(`[Conducks] ⚠️  No policy rules at ${rulesPath} — project rule checks skipped.`);
      return "[]";
    }));
    const report = await sentinel.validate(registry.query.graph.getGraph() as any, rules);

    // `--json` carries BOTH halves and the same exit code. An audit is a gate, so a caller that
    // reads the JSON and a caller that reads the exit status must never disagree — which is why
    // this sits after the sentinel run rather than beside the core audit (ADR 0119).
    //
    // `ruleCount` is in the payload for the reason the human branch says out loud: zero rules
    // passing is not governance holding, and a machine reader needs to be able to tell those apart
    // just as much as a person does.
    if (useJson) {
      process.stdout.write(JSON.stringify({
        success: auditData.success && report.success,
        stats: auditData.stats,
        violations: auditData.violations,
        discoveries: auditData.discoveries ?? [],
        sentinel: { success: report.success, ruleCount: rules.length, violations: report.violations },
      }, null, 2) + '\n');
      // `process.exitCode` + `return`, never `process.exit()` — the same rule the dispatcher states
      // at interfaces/cli/index.ts. `process.exit` does not wait for stdout to drain, and a pipe
      // holds 64 KiB, so on any codebase with more than that much findings every caller reading
      // this JSON through a pipe got it cut off mid-string at exactly 65536 bytes. Redirected to a
      // FILE the whole payload arrived, which is why it survived: the benchmark's own harness read
      // it through a pipe, caught the parse error in a bare `catch`, and printed nothing.
      if (!report.success || !auditData.success) process.exitCode = 1;
      return;
    }

    // Both halves report, ALWAYS, and the exit code comes last. The chain here used to be
    // if/else-if, so a run where the rule set passed and the core checks did not took the third
    // branch and exited 1 having printed no verdict at all — the findings above were on screen with
    // nothing saying whether they were fatal, and the passing rule set was never mentioned. A
    // command that exits non-zero in silence is asking the reader to guess which half failed.
    if (!report.success) {
      console.log("\n\x1b[31m❌ [Sentinel] Custom Governance Violations:\x1b[0m");
      report.violations.forEach((v: any) => console.log(`  - [${v.ruleId}] ${v.nodeId}: ${v.message}`));
    } else {
      // A GREEN TICK ON ZERO RULES IS THE FAILURE THIS PROJECT KEEPS FINDING (ADR 0044, ADR 0073,
      // and the sentinel rule that matched 0 nodes). "0 project rule(s) passed" with a ✅ reads as
      // governance holding, when nothing was checked. Found on subject-b, which has no
      // `config/sentinel.json` at all.
      console.log(rules.length === 0
        ? `\n\x1b[2m➖ [Sentinel] No project rules to check — governance is UNVERIFIED here, not clean.\x1b[0m`
        : `\n\x1b[32m✅ [Sentinel] ${rules.length} project rule(s) passed.\x1b[0m`);
    }

    if (auditData.success) {
      console.log("\x1b[32m✅ [Core] No structural regressions found.\x1b[0m");
    } else {
      console.log("\x1b[31m❌ [Core] Structural regressions found — see the findings above.\x1b[0m");
    }

    // Same reason as the `--json` branch above: let stdout drain, set the code, return.
    if (!report.success || !auditData.success) process.exitCode = 1;
  }

}
