import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import path from "node:path";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";

/**
 * Conducks — Neural Context Generator 🧠
 * 
 * Generates an LLM-optimized architectural summary.
 * - generateFile(): Produced the 4000-token ARCHITECTURE.md.
 * - generateTop10Context(): Produces a structured Top-10 context for MCP.
 */
export class ContextGenerator {
  private readonly TOKEN_CAP_CHARS = 15000; // Roughly 4000 tokens

  private async getLatestPulseId(db: any): Promise<string | null> {
    return new Promise((res) => {
      db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => {
        res(err || rows.length === 0 ? null : rows[0].id);
      });
    });
  }

  private async queryNodes(db: any, pulseId: string, orderBy: string, limit: number = 10): Promise<any[]> {
    return new Promise((res) => {
      db.all(`SELECT * FROM nodes WHERE pulseId = ? ORDER BY ${orderBy} LIMIT ?`, pulseId, limit, (err: any, rows: any[]) => {
        res(err ? [] : rows.map((r: any) => ({
          id: r.id,
          kind: r.kind,
          file: r.file,
          name: r.name,
          risk: r.risk || 0,
          gravity: r.gravity || 0,
          summary: `${r.kind} in ${r.file}`
        })));
      });
    });
  }

  public async generateTop10Context(persistence: any): Promise<any> {
    const db = await persistence.getRawConnection();
    const pulseId = await this.getLatestPulseId(db);
    if (!pulseId) return { error: "No structural pulse found." };

    const entryPoints = await this.queryNodes(db, pulseId, "gravity DESC", 10);
    const hotspots = await this.queryNodes(db, pulseId, "risk DESC", 10);

    const cycles: any[] = await new Promise((res) => {
      db.all("SELECT * FROM nodes WHERE pulseId = ? AND anomaly = 'cycle' LIMIT 10", pulseId, (err: any, rows: any[]) => {
        res(err ? [] : rows);
      });
    });

    return {
      entryPoints,
      hotspots,
      violations: cycles.map(c => ({ id: c.id, type: 'CYCLE' })),
      truncated: true,
      totalCount: entryPoints.length + hotspots.length + cycles.length
    };
  }

  public async generateFileSummary(persistence: any): Promise<string> {
    const db = await persistence.getRawConnection();
    const pulseId = await this.getLatestPulseId(db);
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
      md += `- ${v.type}: ${v.id}\n`;
    }
    md += `\n`;

    md += `## Framework\n`;
    const frameworkRows: any[] = await new Promise((res) => db.all("SELECT value FROM metadata WHERE key = 'framework'", (err: any, rows: any[]) => res(rows || [])));
    const framework = frameworkRows.length > 0 ? frameworkRows[0].value : 'generic';
    md += `- Detected: ${framework}\n`;

    if (md.length > this.TOKEN_CAP_CHARS) {
      return md.substring(0, this.TOKEN_CAP_CHARS) + "\n\n... [TRUNCATED]";
    }
    return md;
  }
}
