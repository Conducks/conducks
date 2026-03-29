import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Conducks — Diff Command (PR Risk Engine)
 * 
 * Maps Git hunks to architectural symbols and calculates 
 * the aggregated structural risk of a set of changes.
 */
export class DiffCommand implements ApostleCommand {
  public id = "diff";
  public description = "Analyze structural risk of current changes (staged/unstaged)";
  public usage = "conducks diff [analyze]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.load(conducks.graph.getGraph());
    
    console.log(`\n\x1b[1m--- 🛡️ Apostle PR Risk Engine ---\x1b[0m`);
    
    // 1. Get changed hunks from Git
    const diff = execSync('git diff -U0', { encoding: 'utf-8' });
    const changes = this.parseDiff(diff);
    
    if (changes.length === 0) {
      console.log("No changes detected in workspace.");
      return;
    }

    const impactedSymbols = new Set<string>();
    
    // 2. Map Hunks to Symbols
    for (const change of changes) {
      const nodes = Array.from(conducks.graph.getGraph().getAllNodes())
        .filter(n => n.properties.filePath === change.file);
      
      for (const line of change.lines) {
        const symbol = nodes.find(n => n.properties.range && 
                                       line >= n.properties.range.startLine && 
                                       line <= n.properties.range.endLine);
        if (symbol) impactedSymbols.add(symbol.id);
      }
    }

    if (impactedSymbols.size === 0) {
      console.log("Changes do not impact any indexed structural symbols.");
      return;
    }

    console.log(`Analyzed ${changes.length} hunks. ${impactedSymbols.size} symbols impacted.\n`);

    let totalRisk = 0;
    const reports = [];

    // 3. Calculate Aggregated Risk
    for (const symbolId of impactedSymbols) {
      const risk = await conducks.calculateCompositeRisk(symbolId);
      if (risk) {
        totalRisk += risk.score;
        reports.push({ id: symbolId, risk: risk.score });
      }
    }

    // 4. Report
    const avgRisk = (totalRisk / impactedSymbols.size) * 10;
    const color = avgRisk > 7 ? '\x1b[31m' : avgRisk > 4 ? '\x1b[33m' : '\x1b[32m';
    
    console.log(`\x1b[1mPR Risk Profile:\x1b[0m ${color}${avgRisk.toFixed(2)} / 10.0\x1b[0m`);
    
    console.log(`\nHigh-Risk Symbols Impacted:`);
    reports.sort((a,b) => b.risk - a.risk).slice(0, 5).forEach(r => {
      console.log(`- \x1b[35m${r.id}\x1b[0m (Risk: ${(r.risk * 10).toFixed(2)})`);
    });
  }

  private parseDiff(diff: string): Array<{ file: string, lines: number[] }> {
    const changes: Array<{ file: string, lines: number[] }> = [];
    let currentFile = '';
    const lines = diff.split('\n');

    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        currentFile = path.resolve(process.cwd(), line.replace('+++ b/', ''));
        changes.push({ file: currentFile, lines: [] });
      } else if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (match && currentFile) {
          const start = parseInt(match[1], 10);
          const count = parseInt(match[2] || '1', 10);
          const last = changes[changes.length - 1];
          for (let i = 0; i < count; i++) {
            last.lines.push(start + i);
          }
        }
      }
    }
    return changes.filter(c => c.lines.length > 0);
  }
}
