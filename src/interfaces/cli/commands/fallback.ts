import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Fallback Analysis Command
 *
 * Analyzes and reports on fallback patterns in the codebase
 */
export class FallbackCommand implements ConducksCommand {
  public id = "fallback";
  public description = "Analyze fallback patterns and identify legacy fallbacks";
  public usage = "conducks fallback [--min-confidence 0.7] [--min-tenure 365] [--limit 20]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const minConfidence = this.parseFloatArg(args, '--min-confidence', 0.7);
    const minTenure = this.parseIntArg(args, '--min-tenure', 365);
    const limit = this.parseIntArg(args, '--limit', 20);

    console.log(`\x1b[35m[Conducks Fallback Analysis] Scanning for suspicious fallback patterns...\x1b[0m`);
    console.log(`Filters: confidence ≥ ${minConfidence}, tenure ≥ ${minTenure} days, limit ${limit}\n`);

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());

    try {
      const results = await registry.analyze.query.execute('suspicious_fallbacks',
        [minConfidence, minTenure, limit]);

      if (results.length === 0) {
        console.log("✅ No suspicious fallback patterns found with current filters.");
        return;
      }

      console.log(`\x1b[31m🚨 Found ${results.length} suspicious fallback patterns:\x1b[0m\n`);

      results.forEach((item: any, index: number) => {
        const confidence = parseFloat(item.fallbackConfidence || 0);
        const fallbackRatio = parseFloat(item.fallbackRatio || 0);
        const namingScore = parseFloat(item.namingScore || 0);
        const tenureDays = parseInt(item.tenureDays || 0);
        const risk = (parseFloat(item.risk || 0) * 10).toFixed(1);

        console.log(`${index + 1}. \x1b[33m${item.name}\x1b[0m (${item.canonicalKind})`);
        console.log(`   📁 ${item.file}`);
        console.log(`   🎯 Risk Score: ${risk}/10.0`);
        console.log(`   🎪 Fallback Confidence: ${confidence.toFixed(2)}`);
        console.log(`   📊 Fallback Usage Ratio: ${(fallbackRatio * 100).toFixed(0)}%`);
        console.log(`   🏷️  Naming Score: ${namingScore.toFixed(2)}`);
        console.log(`   📅 Tenure: ${tenureDays} days`);
        console.log(`   💡 Recommendation: ${this.getRecommendation(item)}`);
        console.log();
      });

      console.log(`\x1b[2m💡 Tip: Use 'conducks explain <id>' for detailed risk breakdown\x1b[0m`);
      console.log(`\x1b[2m💡 Tip: Use 'conducks impact <id>' to see what breaks if removed\x1b[0m`);

    } catch (err) {
      console.error(`Error analyzing fallbacks: ${(err as Error).message}`);
    }
  }

  private getRecommendation(item: any): string {
    const confidence = parseFloat(item.fallbackConfidence || 0);
    const fallbackRatio = parseFloat(item.fallbackRatio || 0);
    const complexity = item.complexity || 1;
    const tenureDays = parseInt(item.tenureDays || 0);

    if (confidence > 0.8 && fallbackRatio < 0.2 && complexity > 15) {
      return "HIGH PRIORITY: Remove - unused complex legacy fallback";
    } else if (confidence > 0.7 && tenureDays > 730) {
      return "MEDIUM PRIORITY: Review - old fallback, may be obsolete";
    } else if (fallbackRatio > 0.8) {
      return "LOW PRIORITY: Monitor - heavily used as fallback";
    } else {
      return "REVIEW: Requires manual inspection";
    }
  }

  private parseFloatArg(args: string[], flag: string, defaultValue: number): number {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1]) {
      const value = parseFloat(args[index + 1]);
      return isNaN(value) ? defaultValue : value;
    }
    return defaultValue;
  }

  private parseIntArg(args: string[], flag: string, defaultValue: number): number {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1]) {
      const value = parseInt(args[index + 1], 10);
      return isNaN(value) ? defaultValue : value;
    }
    return defaultValue;
  }
}