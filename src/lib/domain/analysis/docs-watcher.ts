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
import { statSync, writeFileSync, rmSync } from "node:fs";
import { buildBoard, type DocsBoard } from "@/lib/domain/analysis/docs-board.js";
import { Logger } from "@/lib/core/utils/logger.js";

const logger = new Logger("DocsWatcher");

/**
 * The file readiness is PROVEN with. Deliberately extension-less: `docs-board.ts` only reads `.md`
 * (`walkDocs`, line ~243), so this can never reach the linter, and chokidar's own filter keeps
 * extension-less paths because the ignore rule fires only on a NON-.md file that HAS an extension.
 */
const PROBE_NAME = ".conducks-watch-probe";

/**
 * How long to wait for the watcher to observe its own probe before giving up and arming anyway.
 *
 * Failing OPEN is the right way round for this component: the whole file is log-only on purpose,
 * because a watcher that fails hard turns an editor save into a broken loop. A watcher that never
 * arms would be worse than one that arms optimistically and misses an event.
 */
const PROBE_TIMEOUT_MS = 3000;

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
  /** Set only while readiness is being proven; see `arm`. */
  private probeSeen: (() => void) | null = null;
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
      // `ready` means the initial SCAN finished. It does NOT mean events will be delivered — on
      // macOS chokidar emits it before the fsevents stream is subscribed, and a write landing in
      // that gap produces no event at all. So readiness is PROVEN here, not announced (see `arm`).
      .on("ready", () => { void this.arm(docsDir); })
      .on("add", (fp: string) => this.observe(fp))
      .on("change", (fp: string) => this.observe(fp))
      .on("unlink", (fp: string) => this.observe(fp))
      .on("error", (err: unknown) => logger.error("docs watch failed", err as Error));

    logger.info(`📄 Watching ${docsDir} — re-lints on write, reports only.`);
  }

  public async stop(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
    // A stop() during `arm` would otherwise strand the probe file in the user's docs tree.
    try { rmSync(path.join(this.rootDir, "docs", PROBE_NAME), { force: true }); } catch { /* nothing to clean */ }
    this.probeSeen = null;
    this.pending.clear();
    this.ready = false;
  }

  /**
   * Resolves once the watcher has PROVED it delivers events — not merely once chokidar said `ready`.
   *
   * MEASURED before this changed: with six processes writing 200 files each in a loop, a probe that
   * wrote five docs immediately after `whenReady()` got **0 pulses in 90 seconds** on one run of
   * three, and ~356ms on the others. Binary — never, or immediate. Inserting a one-second settle
   * after `whenReady()` made it 5/5, which is what identified the gap rather than slowness.
   *
   * The caller-visible contract is what was broken: `whenReady()` is a promise this class makes, and
   * "the initial scan finished" is not the thing a caller needs to know. A user who starts the
   * watcher and saves a doc a moment later would silently get no re-lint — no error, no retry, the
   * gate simply quiet at the moment it should fire.
   */
  public whenReady(): Promise<void> { return this.readyPromise; }

  /**
   * Prove the watcher is live by making it observe a write of our own, then arm.
   *
   * The same shape this project used for the mirror readiness race: a readiness that is asserted is
   * a readiness that can be wrong, so it is demonstrated instead. The probe is written INSIDE the
   * watched tree because that is the only thing being tested — that an event in this directory
   * reaches this handler.
   *
   * Fails OPEN after `PROBE_TIMEOUT_MS`: arming late is a missed re-lint, never arming is a broken
   * tool, and this component is log-only precisely so it can never break the author's save loop.
   */
  private async arm(docsDir: string): Promise<void> {
    const probe = path.join(docsDir, PROBE_NAME);
    const observed = new Promise<boolean>(resolve => {
      this.probeSeen = () => resolve(true);
      setTimeout(() => resolve(false), PROBE_TIMEOUT_MS).unref?.();
    });

    let wrote = true;
    try { writeFileSync(probe, String(Date.now())); } catch { wrote = false; }

    const proven = wrote ? await observed : false;
    try { rmSync(probe, { force: true }); } catch { /* best effort — it is one temp file */ }
    this.probeSeen = null;

    this.ready = true;
    if (!proven) {
      logger.warn(
        `📄 watcher armed WITHOUT proof — ${wrote ? "no event for its own probe within " + PROBE_TIMEOUT_MS + "ms" : "could not write a probe"}. ` +
        `Writes may not trigger a re-lint; run 'conducks docs-lint' if a save looks ignored.`,
      );
    }
    this.markReady();
  }

  /**
   * Every filesystem event, before the debounce.
   *
   * The probe is filtered BY NAME rather than by a live flag, and permanently: deleting it emits an
   * `unlink` after the flag would have been cleared, which would have scheduled a pulse naming a
   * file the user never wrote — the exact class of noise the `ready` guard below exists to stop.
   */
  private observe(filePath: string): void {
    if (path.basename(filePath) === PROBE_NAME) { this.probeSeen?.(); return; }
    this.schedule(filePath);
  }

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
