import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import { readFileSync, writeFileSync, watch } from "node:fs";
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
  public usage = "conducks coverage-view <coverage-final.json> [--out coverage.html] [--watch] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const outIdx = args.indexOf("--out");
    const outValue = outIdx !== -1 ? args[outIdx + 1] : undefined;

    // `--out` took the next argv entry whatever it was, so `coverage-view cov.json --out --watch`
    // wrote a 344 KB HTML file literally NAMED `--watch` and then watched anyway. A flag is never a
    // filename (ADR 0116).
    if (outIdx !== -1 && (!outValue || outValue.startsWith("-"))) {
      console.error(chalk.red(
        `--out needs a filename${outValue ? `, and \`${outValue}\` is a flag` : " and none was given"}. Usage: `
      ) + this.usage);
      process.exitCode = 1;
      return;
    }

    // Same rule as `coverage`: the report is the first positional, whatever it is named.
    const covPath = args.filter((a, i) => !a.startsWith("-") && i !== outIdx + 1)[0];
    const outPath = outValue ?? "coverage.html";
    const isWatch = args.includes("--watch");

    if (!covPath) {
      console.error(chalk.red("Missing coverage file. Usage: ") + this.usage);
      process.exitCode = 1;
      return;
    }

    const resolvedOut = outPath.startsWith("/") ? outPath : path.resolve(process.cwd(), outPath);

    // Structural side queried ONCE — the graph doesn't change during a test-watch session. Through
    // the registry, which holds the single definition of this node set (ADR 0116).
    const nodes = await registry.coverage.nodes();

    // Re-bind the (changing) coverage file against the (fixed) graph and rewrite the HTML.
    // Returns false if the coverage file couldn't be read (e.g. mid-write); caller may retry.
    const regenerate = (): boolean => {
      // ONE implementation, shared with `conducks coverage` (ADR 0004, todo25#P8).
      //
      // This file used to carry its own copy of the istanbul parse, the suffix matcher and the
      // binding loop. Both copies are currently correct — `memory.md` claimed this one still had the
      // old bare-basename fallback that lit every same-named file FULL, and that claim was stale —
      // but two implementations of one rule is the condition under which the next fix reaches only
      // one of them, which is exactly what happened last time.
      //
      // `parse` now REFUSES a JSON file that is not an istanbul report rather than reading it as an
      // empty one, so this catch covers both "cannot read" and "is not a coverage report".
      let results: ReturnType<typeof registry.coverage.bindNodes>;
      try {
        results = registry.coverage.bindNodes(nodes as any, registry.coverage.parse(covPath));
      } catch (e) {
        if (!isWatch) console.error(chalk.red(`${(e as Error).message}`));
        return false;
      }

      const bound = results.filter(r => r.bound);
      // An empty page is the same fabrication the terminal overlay used to print: it renders "0
      // full · 0 partial · 0 dark" and exits 0, which reads as "this project has no coverage" when
      // what happened is that the report describes a different tree (ADR 0116).
      if (bound.length === 0) {
        if (!isWatch) {
          console.error(chalk.red(
            `The coverage report bound to none of this project's ${nodes.length} functions — nothing to render.\n` +
            `  report names:  ${[...registry.coverage.parse(covPath).ranByFile.keys()][0] ?? "(the report is empty — nothing was instrumented)"}\n` +
            `  graph holds:   ${(nodes[0] as any)?.file ?? "(the graph holds no function with a line span)"}`
          ));
        }
        return false;
      }
      const byFile = new Map<string, typeof bound>();
      for (const r of bound) {
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file)!.push(r);
      }
      writeFileSync(resolvedOut, this.renderHtml(byFile, nodes.length, registry.coverage.weightedPct), "utf8");
      const full = bound.filter(r => r.pct >= 99).length;
      const part = bound.filter(r => r.pct > 0 && r.pct < 99).length;
      const dark = bound.filter(r => r.pct === 0).length;
      const stamp = isWatch ? chalk.dim(" (re-rendered)") : "";
      console.log(chalk.bold("\n--- 🟩🖼️  Conducks Coverage View ---") + stamp + "\n");
      console.log(`  ${chalk.green(full + " full")} · ${chalk.yellow(part + " partial")} · ${chalk.gray(dark + " dark")}` +
        `   (${bound.length} functions bound of ${nodes.length} with spans)`);
      console.log(chalk.dim(`  Wrote ${resolvedOut}`));
      return true;
    };

    try {
      // The return value was discarded, so an unreadable report printed an error and exited 0 —
      // nothing scripting this command could tell a rendered page from a failure (ADR 0116).
      const ok = regenerate();
      if (!isWatch) {
        if (!ok) process.exitCode = 1;
        return;
      }

      // C5 (live, v1): re-render whenever the coverage file changes. Run `jest --watch`
      // (or c8 --watch) in another terminal — each test re-run rewrites coverage-final.json,
      // and the overlay refreshes. Not the full "click through the app" stream (that needs a
      // running app instrumented), but the same feedback loop for a test-driven session.
      console.log(chalk.cyan(`\n  👁  Watching ${covPath} — re-renders on change. Ctrl-C to stop.`));
      let timer: NodeJS.Timeout | null = null;
      watch(covPath, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { regenerate(); }, 150); // debounce mid-write bursts
      });
      // Keep the process alive until interrupted.
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => { console.log(chalk.dim("\n  Stopped watching.")); resolve(); });
      });
    } finally {
      await closePersistence(registry);
    }
  }

  private renderHtml(
    byFile: Map<string, Array<{ name: string; file: string; start: number; end: number; pct: number; bound: boolean }>>,
    totalNodes: number,
    weightedPct: (rows: Array<{ start: number; end: number; pct: number }>) => number
  ): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const colorFor = (pct: number) => pct >= 99 ? "#2ecc71" : pct > 0 ? "#f0ad4e" : "#8a8f98";

    const files = [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let totalFns = 0, totalFull = 0, totalPart = 0, totalDark = 0;

    const fileSections = files.map(([file, fns]) => {
      const sorted = [...fns].sort((a, b) => a.start - b.start);
      // Line-weighted, NOT the mean of the per-function percentages. The mean let a fully-covered
      // three-line helper outvote a dark three-hundred-line function: measured on conducks itself,
      // `server.ts` read 48% by mean and 80% by line — a 32-point error on the number a reader takes
      // as the file's coverage (ADR 0116). The `data-weighted` attribute is what the regression test
      // asserts, because the two agree whenever every function in a file happens to be equal-sized.
      const avgPct = weightedPct(sorted);
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
          <div class="file-summary-track" data-weighted="true" title="Lines covered / lines in this file's functions">
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
      <span><b>${weightedPct([...byFile.values()].flat())}%</b> of lines covered</span>
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
