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
  public usage = "conducks diff [--base <id>] [--head <id>]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const baseIdx = args.indexOf('--base');
    const headIdx = args.indexOf('--head');
    
    if (baseIdx !== -1) {
      const basePulseId = args[baseIdx + 1];
      const headPulseId = headIdx !== -1 ? args[headIdx + 1] : null; // null means current
      console.log(`[DEBUG] Diffing Base: ${basePulseId}, Head: ${headPulseId}`);

      await this.executeChronoscopicDiff(basePulseId, headPulseId, persistence);
      return;
    }

    // Default: Git-based PR Risk Engine
    await persistence.load(conducks.graph.getGraph());
    
    console.log(`\n\x1b[1m--- 🛡️ Apostle PR Risk Engine ---\x1b[0m`);
    
    // 1. Get changed hunks from Git
    let diff = "";
    try {
      diff = execSync('git diff -U0', { encoding: 'utf-8' });
    } catch (e) {
      console.error("Error: Git diff failed. Is this a git repository?");
      return;
    }
    const changes = this.parseDiff(diff);
    
    if (changes.length === 0) {
      console.log("No structural changes detected in workspace.");
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

  private async executeChronoscopicDiff(baseId: string, headId: string | null, persistence: SynapsePersistence): Promise<void> {
    const { ConducksAdjacencyList } = await import("../../../lib/core/graph/adjacency-list.js");
    const { ConducksDiffEngine } = await import("../../../lib/core/graph/diff-engine.js");
    const { DuckDbPersistence } = await import("../../../lib/core/graph/persistence.js");

    const baseGraph = new ConducksAdjacencyList();
    const headGraph = new ConducksAdjacencyList();
    
    const db = persistence as any;
    if (!(db instanceof DuckDbPersistence)) {
      console.error("Chronoscopic diff requires DuckDB persistence.");
      return;
    }

    console.log(`\n\x1b[1m--- 🏺 Chronoscopic Structural Diff ---\x1b[0m`);
    console.log(`Base: \x1b[33m${baseId}\x1b[0m`);
    console.log(`Head: \x1b[33m${headId || 'Current Workspace'}\x1b[0m`);

    // Load Base
    const rawDb = await db.getRawConnection();
    const baseNodes: any[] = await new Promise((res) => rawDb.all("SELECT * FROM nodes WHERE pulseId = ?", [baseId], (err: any, rows: any[]) => res(rows || [])));
    const baseEdges: any[] = await new Promise((res) => rawDb.all("SELECT * FROM edges WHERE pulseId = ?", [baseId], (err: any, rows: any[]) => res(rows || [])));
    console.log(`[DEBUG] Loaded Base: ${baseNodes.length} nodes, ${baseEdges.length} edges`);
    
    this.reconstitute(baseGraph, baseNodes, baseEdges);

    // Load Head
    if (headId) {
      const headNodes: any[] = await new Promise((res) => rawDb.all("SELECT * FROM nodes WHERE pulseId = ?", [headId], (err: any, rows: any[]) => res(rows || [])));
      const headEdges: any[] = await new Promise((res) => rawDb.all("SELECT * FROM edges WHERE pulseId = ?", [headId], (err: any, rows: any[]) => res(rows || [])));
      console.log(`[DEBUG] Loaded Head: ${headNodes.length} nodes, ${headEdges.length} edges`);
      this.reconstitute(headGraph, headNodes, headEdges);
    } else {
      await persistence.load(headGraph);
    }

    const diffEngine = new ConducksDiffEngine();
    const result = diffEngine.diff(baseGraph, headGraph);

    console.log(`\n\x1b[1mSummary:\x1b[0m ${result.summary}`);
    
    if (Object.keys(result.drift).length > 0) {
      console.log(`\n\x1b[1mArchitectural Drift Detected:\x1b[0m`);
      Object.entries(result.drift).slice(0, 10).forEach(([id, deltas]: [string, any]) => {
        let driftMsg = `- \x1b[35m${id}\x1b[0m: `;
        if (deltas.gravityShift) driftMsg += `\x1b[36mΔGravity:\x1b[0m ${deltas.gravityShift > 0 ? '+' : ''}${deltas.gravityShift.toFixed(4)} `;
        if (deltas.complexityBloat) driftMsg += `\x1b[31mΔComplexity:\x1b[0m ${deltas.complexityBloat > 0 ? '+' : ''}${deltas.complexityBloat} `;
        if (deltas.resonanceDrift) driftMsg += `\x1b[32mΔResonance:\x1b[0m ${deltas.resonanceDrift > 0 ? '+' : ''}${deltas.resonanceDrift} `;
        console.log(driftMsg);
      });
    }

    if (result.nodes.added > 0) {
      console.log(`\n\x1b[1mTop New Symbols:\x1b[0m`);
      result.nodes.list.added.slice(0, 5).forEach((id: string) => console.log(`  + ${id}`));
    }
  }

  private reconstitute(graph: any, nodes: any[], edges: any[]) {
    nodes.forEach(row => {
      let meta = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch (e) {}
      graph.addNode({
        id: row.id,
        label: row.label,
        properties: {
          ...meta,
          name: row.name,
          filePath: row.filePath,
          rank: row.rank,
          complexity: row.complexity,
          resonance: row.resonance,
          entropy: row.entropy,
          primaryAuthor: row.primaryAuthor,
          authorCount: row.authorCount,
          lastModified: row.lastModified,
          tenureDays: row.tenureDays,
          anomaly: row.anomaly,
          isTest: !!row.isTest
        }
      });
    });

    edges.forEach(row => {
      graph.addEdge({
        id: row.id,
        sourceId: row.sourceId,
        targetId: row.targetId,
        type: row.type,
        confidence: row.confidence,
        properties: JSON.parse(row.properties || '{}')
      });
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
