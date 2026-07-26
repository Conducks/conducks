/**
 * Conducks — Docs Watcher 📄👁️
 *
 * Watches `docs/` and re-lints on write. Until this existed the gate only ran when someone typed
 * `conducks docs-lint`, so a broken link or a wrapped value survived until review — the docs drifted
 * in exactly the window where the author still remembers what they meant.
 *
 * LOG-ONLY, deliberately. A watcher that fails hard turns an editor save into a broken loop, and a
 * developer who cannot save disables the watcher, which is worse than not shipping one. The
 * exit-code surface stays where it belongs: `conducks docs-lint` for CI and pre-commit.
 *
 * It re-reads the whole docs tree rather than the one changed file, because the findings that matter
 * are cross-file — a `- Builds:` is only danglingly wrong relative to the other files. A docs tree is
 * tens of small markdown files; the read is not worth optimising away.
 */
import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";
import { statSync } from "node:fs";
import { buildBoard, type DocsBoard } from "@/lib/domain/analysis/docs-board.js";
import { Logger } from "@/lib/core/utils/logger.js";

const logger = new Logger("DocsWatcher");

export interface DocsPulse {
  event: "docs";
  /** Every doc that changed inside the debounce window — a burst is one pulse, not one per file. */
  files: string[];
  /** The most recent of them, for a one-line display. */
  filePath: string;
  violations: number;
  warnings: number;
  open: number;
}

export class DocsWatcher {
  public readonly id = "docs-watcher";
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  /**
   * Chokidar's initial scan races with `ignoreInitial`: a file written moments before `start()` can
   * still arrive as an `add`, so the first pulse reports a file nobody touched. Nothing before
   * `ready` is a write we are watching for.
   */
  private ready = false;
  private pending = new Set<string>();
  private readyPromise: Promise<void> = Promise.resolve();
  private markReady: () => void = () => {};
  private onPulse?: (pulse: DocsPulse) => void;

  constructor(private rootDir: string, private debounceMs = 300) {}

  /** Dependency inversion, same shape as the structural watcher: web subscribes, domain never imports it. */
  public setPulseSubscriber(onPulse: (pulse: DocsPulse) => void): void {
    this.onPulse = onPulse;
  }

  public start(): void {
    if (this.watcher) return;
    const docsDir = path.join(this.rootDir, "docs");
    try { if (!statSync(docsDir).isDirectory()) return; } catch { return; }

    this.readyPromise = new Promise<void>(resolve => { this.markReady = resolve; });
    this.watcher = chokidar.watch(docsDir, {
      ignored: (p: string) => /\/(node_modules|\.git)\//.test(p) || (p.endsWith(".md") === false && /\.\w+$/.test(p)),
      persistent: true,
      ignoreInitial: true,
    });
    this.watcher
      .on("ready", () => { this.ready = true; this.markReady(); })
      .on("add", (fp: string) => this.schedule(fp))
      .on("change", (fp: string) => this.schedule(fp))
      .on("unlink", (fp: string) => this.schedule(fp))
      .on("error", (err: unknown) => logger.error("docs watch failed", err as Error));

    logger.info(`📄 Watching ${docsDir} — re-lints on write, reports only.`);
  }

  public async stop(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
    this.pending.clear();
    this.ready = false;
  }

  /** Resolves once the initial scan is done and later writes are real events, not scan leftovers. */
  public whenReady(): Promise<void> { return this.readyPromise; }

  /** Debounced: a multi-file edit (or an editor writing twice) is one re-lint, not six. */
  private schedule(filePath: string): void {
    if (!this.ready) return;
    this.pending.add(path.relative(this.rootDir, filePath));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.run(); }, this.debounceMs);
  }

  private run(): void {
    const files = [...this.pending];
    this.pending.clear();
    let board: DocsBoard;
    try {
      board = buildBoard(this.rootDir);
    } catch (err) {
      logger.error("docs re-lint failed", err as Error);
      return;
    }
    const violations = board.lint.reduce((a, l) => a + l.errs.length, 0);
    const warnings = board.warns.reduce((a, w) => a + w.errs.length, 0);
    const open = board.decisions.filter(d => d.buildState === "partial" || d.buildState === "unbuilt").length;

    const rel = files[files.length - 1] ?? "docs";
    if (violations) {
      // Name the offending files, not just a count: a count sends you back to the CLI to find out.
      logger.warn(`📄 ${rel} → ${violations} grammar violation(s): ` +
        board.lint.map(l => `${l.file} (${l.errs.length})`).join(", "));
      for (const l of board.lint) for (const e of l.errs) logger.warn(`    ${l.file}: ${e}`);
    } else {
      logger.info(`📄 ${rel} → grammar clean${warnings ? `, ${warnings} hygiene warning(s)` : ""}`);
    }
    this.onPulse?.({ event: "docs", files, filePath: rel, violations, warnings, open });
  }
}
