import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Coverage View Command 🏺 🟩🖼️
 *
 * Same range-join as `coverage` (istanbul coverage-final.json → BEHAVIOR node spans),
 * but instead of printing terminal bars, renders a self-contained static HTML page
 * grouping functions by file, with a fill-bar per function and a file-level summary bar.
 * No external assets — everything (CSS) is inlined so the file works fully offline.
 */
export class CoverageViewCommand implements ConducksCommand {
  public id = "coverage-view";
  public description = "Render istanbul/c8 coverage overlay as a self-contained static HTML file";
  public usage = "conducks coverage-view <coverage-final.json> [--out coverage.html] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const covPath = args.find(a => a.endsWith(".json") && !a.startsWith("--"));
    const outIdx = args.indexOf("--out");
    const outPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : "coverage.html";

    if (!covPath) {
      console.error(chalk.red("Missing coverage file. Usage: ") + this.usage);
      process.exitCode = 1;
      return;
    }

    try {
      // 1. Runtime signal: istanbul coverage → ran-lines per file (lowercased path key).
      let cov: Record<string, any>;
      try {
        cov = JSON.parse(readFileSync(covPath, "utf8"));
      } catch (e) {
        console.error(chalk.red(`Cannot read coverage file ${covPath}: ${(e as Error).message}`));
        process.exitCode = 1;
        return;
      }
      const ranByFile = new Map<string, Set<number>>();
      for (const [file, d] of Object.entries<any>(cov)) {
        const lines = new Set<number>();
        const sm = d.statementMap || {}, s = d.s || {};
        for (const id of Object.keys(sm)) {
          if ((s[id] || 0) > 0) {
            const st = sm[id];
            const end = (st.end && st.end.line) || st.start.line;
            for (let ln = st.start.line; ln <= end; ln++) lines.add(ln);
          }
        }
        ranByFile.set(file.toLowerCase(), lines);
      }

      // 2. Structural side: BEHAVIOR nodes that carry a real line span.
      const nodes = await registry.infrastructure.persistence.query<{
        name: string; file: string; lineStart: number; lineEnd: number;
      }>(
        `SELECT name, file, lineStart, lineEnd FROM nodes
         WHERE canonicalKind = 'BEHAVIOR' AND lineEnd > lineStart
         ORDER BY file, lineStart`
      );

      const covKeys = [...ranByFile.keys()];
      const matchFile = (f: string): string | undefined => {
        const lf = f.toLowerCase();
        return covKeys.find(k => k === lf || k.endsWith(lf) || lf.endsWith(k)
          || k.endsWith("/" + lf.split("/").pop()));
      };

      // 3. The bind: range-join each covered line into the node whose span contains it.
      const results: Array<{ name: string; file: string; start: number; end: number; pct: number; bound: boolean }> = [];
      for (const n of nodes) {
        const key = matchFile(n.file);
        const span = n.lineEnd - n.lineStart + 1;
        let hit = 0;
        if (key) {
          const ran = ranByFile.get(key)!;
          for (let ln = n.lineStart; ln <= n.lineEnd; ln++) if (ran.has(ln)) hit++;
        }
        results.push({
          name: n.name, file: n.file, start: n.lineStart, end: n.lineEnd,
          pct: Math.round((hit / span) * 100), bound: !!key,
        });
      }

      const bound = results.filter(r => r.bound);

      // 4. Group by file for the HTML report.
      const byFile = new Map<string, typeof bound>();
      for (const r of bound) {
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file)!.push(r);
      }

      const html = this.renderHtml(byFile, nodes.length);
      const resolvedOut = outPath.startsWith("/") ? outPath : path.resolve(process.cwd(), outPath);
      writeFileSync(resolvedOut, html, "utf8");

      const full = bound.filter(r => r.pct >= 99).length;
      const part = bound.filter(r => r.pct > 0 && r.pct < 99).length;
      const dark = bound.filter(r => r.pct === 0).length;
      console.log(chalk.bold("\n--- 🟩🖼️  Conducks Coverage View ---\n"));
      console.log(`  ${chalk.green(full + " full")} · ${chalk.yellow(part + " partial")} · ${chalk.gray(dark + " dark")}` +
        `   (${bound.length} functions bound of ${nodes.length} with spans)`);
      console.log(chalk.dim(`  Wrote ${resolvedOut}`));
      console.log();
    } finally {
      await closePersistence(registry);
    }
  }

  private renderHtml(
    byFile: Map<string, Array<{ name: string; file: string; start: number; end: number; pct: number; bound: boolean }>>,
    totalNodes: number
  ): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const colorFor = (pct: number) => pct >= 99 ? "#2ecc71" : pct > 0 ? "#f0ad4e" : "#8a8f98";

    const files = [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let totalFns = 0, totalFull = 0, totalPart = 0, totalDark = 0;

    const fileSections = files.map(([file, fns]) => {
      const sorted = [...fns].sort((a, b) => a.start - b.start);
      const avgPct = Math.round(sorted.reduce((sum, r) => sum + r.pct, 0) / sorted.length);
      totalFns += sorted.length;
      totalFull += sorted.filter(r => r.pct >= 99).length;
      totalPart += sorted.filter(r => r.pct > 0 && r.pct < 99).length;
      totalDark += sorted.filter(r => r.pct === 0).length;

      const rows = sorted.map(r => `
        <div class="fn-row">
          <div class="fn-bar-track">
            <div class="fn-bar-fill" style="width:${r.pct}%;background:${colorFor(r.pct)}"></div>
          </div>
          <span class="fn-pct" style="color:${colorFor(r.pct)}">${r.pct}%</span>
          <span class="fn-name">${esc(r.name)}</span>
          <span class="fn-range">${r.start}-${r.end}</span>
        </div>`).join("");

      return `
      <section class="file-card">
        <header class="file-header">
          <div class="file-name">${esc(file)}</div>
          <div class="file-summary-track">
            <div class="file-summary-fill" style="width:${avgPct}%;background:${colorFor(avgPct)}"></div>
          </div>
          <span class="file-pct" style="color:${colorFor(avgPct)}">${avgPct}%</span>
        </header>
        <div class="fn-list">${rows}</div>
      </section>`;
    }).join("");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Conducks Coverage View</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #f5f6f8;
    --card-bg: #ffffff;
    --text: #1a1d23;
    --text-dim: #6b7280;
    --border: #e2e4e9;
    --track: #edeef1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a;
      --card-bg: #1c1f26;
      --text: #e7e9ee;
      --text-dim: #9aa0ac;
      --border: #2b2f38;
      --track: #262a33;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 24px 64px;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: var(--text-dim); font-size: 13px; margin: 0 0 24px; }
  .totals {
    display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap;
    font-size: 13px; color: var(--text-dim);
  }
  .totals b { color: var(--text); }
  .file-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }
  .file-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
  }
  .file-name {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
    color: var(--text);
    flex: 0 0 auto;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-summary-track {
    flex: 1 1 auto;
    height: 8px;
    background: var(--track);
    border-radius: 4px;
    overflow: hidden;
  }
  .file-summary-fill { height: 100%; border-radius: 4px; }
  .file-pct { font-size: 12px; font-weight: 600; width: 40px; text-align: right; }
  .fn-list { display: flex; flex-direction: column; gap: 6px; }
  .fn-row {
    display: grid;
    grid-template-columns: 120px 40px 1fr auto;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
  }
  .fn-bar-track {
    height: 6px;
    background: var(--track);
    border-radius: 3px;
    overflow: hidden;
  }
  .fn-bar-fill { height: 100%; border-radius: 3px; }
  .fn-pct { font-weight: 600; text-align: right; }
  .fn-name {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fn-range { color: var(--text-dim); font-family: "SF Mono", Menlo, Consolas, monospace; white-space: nowrap; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>🟩 Conducks Coverage View</h1>
    <p class="subtitle">Runtime coverage overlaid onto the structural graph — generated by <code>conducks coverage-view</code></p>
    <div class="totals">
      <span><b>${totalFull}</b> full</span>
      <span><b>${totalPart}</b> partial</span>
      <span><b>${totalDark}</b> dark</span>
      <span><b>${totalFns}</b> functions bound of ${totalNodes} with spans</span>
      <span><b>${files.length}</b> files</span>
    </div>
    ${fileSections}
  </div>
</body>
</html>
`;
  }
}
