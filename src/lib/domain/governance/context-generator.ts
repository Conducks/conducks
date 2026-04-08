import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import path from "node:path";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Neural Context Generator
 */
export class ContextGenerator implements ConducksComponent {
  public readonly id = 'context-generator';
  public readonly type = 'analyzer';
  public readonly description = 'Generates LLM-optimized architectural summaries and localized structural context.';
  private readonly TOKEN_CAP_CHARS = 15000; // Roughly 4000 tokens
  private persistence: SynapsePersistence | null = null;

  /**
   * Conducks Re-Anchoring 🏺
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
  }

  private async getLatestPulseId(persistence?: SynapsePersistence): Promise<string | null> {
    const p = persistence || this.persistence;
    if (!p) return null;
    const rows = await p.query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    return rows && rows.length > 0 ? (rows[0] as any).id : null;
  }

  private async queryNodes(persistence: SynapsePersistence, pulseId: string, orderBy: string, limit: number = 10): Promise<any[]> {
    const rows = await persistence.query(`SELECT * FROM nodes WHERE pulseId = ? ORDER BY ${orderBy} LIMIT ?`, [pulseId, limit]);
    return rows.map((r: any) => ({
      id: r.id,
      kind: r.canonicalKind || r.kind,
      file: r.file,
      name: r.name,
      risk: r.risk || 0,
      gravity: r.gravity || 0,
      summary: `${r.canonicalKind || r.kind} in ${r.file}`
    }));
  }

  public async generateTop10Context(persistence?: SynapsePersistence): Promise<any> {
    const p = persistence || this.persistence;
    if (!p) return { error: "Persistence layer not anchored." };

    const pulseId = await this.getLatestPulseId(p);
    if (!pulseId) return { error: "No structural pulse found." };

    const entryPoints = await this.queryNodes(p, pulseId, "gravity DESC", 10);
    const hotspots = await this.queryNodes(p, pulseId, "risk DESC", 10);

    // [Sentinel Scan] — High complexity + high churn + high risk
    const cycles = await p.query("SELECT * FROM nodes WHERE pulseId = ? AND risk > 0.8 LIMIT 10", [pulseId]);

    return {
      entryPoints,
      hotspots,
      violations: cycles.map((c: any) => ({ 
        id: c.id, 
        type: 'RISK_HOTSPOT', 
        factors: JSON.parse(c.metadata || '{}').factors || [] 
      })),
      truncated: true,
      totalCount: entryPoints.length + hotspots.length + cycles.length
    };
  }

  public async generateFileSummary(persistence: SynapsePersistence): Promise<string> {
    const pulseId = await this.getLatestPulseId(persistence);
    if (!pulseId) return "# Architecture Context — Error\nNo pulse data found.";

    const context = await this.generateTop10Context(persistence);
    const projectName = path.basename(chronicle.getProjectDir() || "unknown");
    const timestamp = new Date().toISOString();

    let md = `# Architecture Context — ${projectName}\n`;
    md += `Generated: ${timestamp} | Pulse: ${pulseId}\n\n`;

    md += `## Entry Points (top 10 by gravity)\n`;
    for (const ep of context.entryPoints) {
      md += `- \`${ep.id}\` [${ep.kind}, gravity: ${ep.gravity.toFixed(4)}, risk: ${ep.risk.toFixed(4)}]\n`;
    }
    md += `\n`;

    md += `## Structural Hotspots (top 10 by risk)\n`;
    for (const hs of context.hotspots) {
      md += `- \`${hs.id}\` [risk: ${hs.risk.toFixed(4)}, gravity: ${hs.gravity.toFixed(4)}]\n`;
    }
    md += `\n`;

    md += `## Active Violations (${context.violations.length})\n`;
    for (const v of context.violations) {
      const factors = v.factors && v.factors.length > 0 ? ` [Factors: ${v.factors.join(', ')}]` : '';
      md += `- ${v.type}: \`${v.id}\`${factors}\n`;
    }
    md += `\n`;

    md += `## Framework\n`;
    const frameworkRows = await persistence.query("SELECT value FROM metadata WHERE key = 'framework'");
    const framework = frameworkRows.length > 0 ? (frameworkRows[0] as any).value : 'generic';
    md += `- Detected: ${framework}\n`;

    if (md.length > this.TOKEN_CAP_CHARS) {
      return md.substring(0, this.TOKEN_CAP_CHARS) + "\n\n... [TRUNCATED]";
    }
    return md;
  }
}
