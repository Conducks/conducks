import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { ConducksSentinel } from "@/lib/domain/governance/sentinel.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { FallbackDetector } from "@/lib/domain/analysis/fallback-detector.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Conducks — Audit Command (Standardized Taxonomy)
 */
export class AuditCommand implements ConducksCommand {
  public id = "audit";
  public description = "Audit structural integrity and governance (--fallback for legacy fallback analysis)";
  public usage = "conducks audit [--fallback] [--history=<window>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const historyArg = args.find(a => a.startsWith("--history"));
    const fallbackArg = args.find(a => a.startsWith("--fallback"));

    if (fallbackArg) {
      await this.runFallbackAnalysis(registry);
      return;
    }

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

    console.log("\x1b[35m[Conducks Audit] Auditing Core Structural Integrity...\x1b[0m");

    const auditData = await (registry.audit as any).audit();
    
    // 1. Structural Orphans (Conducks Refactoring Alerts) 🏺
    if (auditData.stats.orphans > 0) {
      console.log(`\n\x1b[31m💣 [Refactoring Alert] ${auditData.stats.orphans} Orphaned Synapses Detected:\x1b[0m`);
      // Display first 10 for brevity, user can use GQL for more
      auditData.violations
        .filter((v: any) => v.type === 'REFACTOR')
        .slice(0, 10)
        .forEach((v: any) => console.log(`  - ${v.message}`));
      if (auditData.stats.orphans > 10) console.log(`  ... and ${auditData.stats.orphans - 10} more.`);
    }

    // 2. Circular Dependencies
    if (auditData.stats.cycles > 0) {
      console.log(`\n\x1b[31m🔄 [Architectural Alert] ${auditData.stats.cycles} Circular Dependencies Detected:\x1b[0m`);
      auditData.violations
        .filter((v: any) => v.type === 'CIRCULAR')
        .forEach((v: any) => console.log(`  - ${v.message}`));
    }

    // 3. Sentinel Static Governance (Rule-based)
    const sentinel = new ConducksSentinel();
    const rulesPath = path.join(chronicle.getProjectDir(), 'config/sentinel.json');
    const rules = JSON.parse(await fs.readFile("config/sentinel.json", "utf-8").catch(() => "[]"));
    const report = await sentinel.validate(registry.query.graph.getGraph() as any, rules);

    if (report.success && auditData.success) {
      console.log("\n\x1b[32m✅ Conducks Governance confirmed. No structural regressions found.\x1b[0m");
    } else if (!report.success) {
      console.log("\x1b[31m❌ [Sentinel] Custom Governance Violations:\x1b[0m");
      report.violations.forEach((v: any) => console.log(`  - [${v.ruleId}] ${v.nodeId}: ${v.message}`));
      process.exit(1);
    } else if (!auditData.success) {
      // Exit if core structural issues exist
      process.exit(1);
    }
  }

  private async runFallbackAnalysis(registry: Registry): Promise<void> {
    console.log(`\x1b[35m[Conducks Audit] Analyzing fallback patterns...\x1b[0m`);

    const detector = new FallbackDetector();
    const graph = registry.infrastructure.graphEngine.getGraph();
    const allNodes = Array.from(graph.getAllNodes());

    // Find all functions that appear to be fallbacks
    const fallbackCandidates = allNodes
      .filter(node => node.properties.canonicalKind === 'BEHAVIOR')
      .map(node => {
        const analysis = detector.detectFallbackPatterns(node, graph);
        return {
          node,
          analysis
        };
      })
      .filter(item => item.analysis.isFallback)
      .sort((a, b) => b.analysis.confidence - a.analysis.confidence)
      .slice(0, 20); // Top 20 most suspicious

    if (fallbackCandidates.length === 0) {
      console.log("✅ No suspicious fallback patterns found.");
      return;
    }

    console.log(`\n\x1b[31m🚨 Found ${fallbackCandidates.length} suspicious fallback patterns:\x1b[0m\n`);

    fallbackCandidates.forEach(({ node, analysis }, index) => {
      const confidence = (analysis.confidence * 100).toFixed(0);
      const fallbackRatio = (analysis.patterns.usageRatio.ratio * 100).toFixed(0);

      console.log(`${index + 1}. \x1b[33m${node.properties.name}\x1b[0m (${node.properties.canonicalKind})`);
      console.log(`   📁 ${node.properties.filePath}`);
      console.log(`   🎯 Fallback Confidence: ${confidence}%`);
      console.log(`   📊 Fallback Usage Ratio: ${fallbackRatio}%`);
      console.log(`   🏷️  Naming Score: ${(analysis.patterns.namingPatterns.score * 100).toFixed(0)}%`);

      const recommendation = analysis.confidence > 0.8 ? 'HIGH PRIORITY: Remove legacy fallback' :
                           analysis.confidence > 0.6 ? 'MEDIUM PRIORITY: Review fallback necessity' :
                           'LOW PRIORITY: Monitor fallback usage';

      console.log(`   💡 Recommendation: ${recommendation}`);
      console.log();
    });

    console.log(`\x1b[2m💡 Tip: Use 'conducks explain <id>' for detailed risk breakdown\x1b[0m`);
  }
}
