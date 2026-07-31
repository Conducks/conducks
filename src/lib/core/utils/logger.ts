import fs from 'node:fs';
import path from 'node:path';

/**
 * Conducks — Unified Logger
 * 
 * Ensures all logs are sent to stderr to prevent corruption of the MCP stdout stream.
 * Now supports persistent file-based logging for real-time monitoring.
 */
export class Logger {
  private prefix: string;
  private enabled: boolean;
  private logFilePath: string | null = null;

  /**
   * Suppress the STDERR half of logging. The file sink is untouched.
   *
   * `conducks status` printed five boot lines to stderr before its report — grammar engine starting,
   * grammar engine ready, log sink anchored, synapse anchored, resonance flow pushed — on every
   * read-only command. None of it is the answer the caller asked for, and a tool that narrates its
   * own startup is one an agent has to filter (todo02#P2).
   *
   * Quiet does NOT mean lost, which is the reason this is a stderr switch rather than a `write()`
   * guard: every suppressed line still lands in `.conducks/mcp.log`, so a failure is still
   * diagnosable afterwards. Deleting the diagnostics would trade noise for blindness.
   *
   * The MCP server does NOT set this. There, stdout is the JSON-RPC channel and stderr is the only
   * legal log sink, so the same lines are the correct and only way to see what the server is doing.
   */
  private static quiet: boolean = false;

  /**
   * STATIC, because quietness is a property of the PROCESS, not of one logger.
   *
   * Modules build their own instances — `new Logger("ConducksGraph")` is one — so a per-instance
   * flag set on the shared singleton silenced four of the five boot lines and left the fifth
   * ("Pushing Structural Resonance Flow") printing from an instance nobody had a handle to. Found by
   * measuring the output rather than by reading the code.
   */
  public setQuiet(quiet: boolean): void { Logger.quiet = quiet; }
  public isQuiet(): boolean { return Logger.quiet; }

  /**
   * A startup diagnostic: to the terminal only when not quiet, to the file sink always.
   *
   * Exists because the noisiest lines were raw `process.stderr.write` calls made before any logger
   * was configured, so they could not be silenced by a level or a flag — the bootstrapper wrote
   * straight to the file descriptor.
   */
  public boot(message: string): void {
    if (!Logger.quiet) process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
    this.toFile('BOOT', message.replace(/\n$/, ''));
  }

  constructor(prefix: string = "Conducks", enabled: boolean = true) {
    this.prefix = prefix;
    this.enabled = enabled;
  }

  /**
   * Anchors the logger to a specific file.
   * v1.12.0: Synchronous appends ensure logs are written before process termination. 🏺 💎.
   */
  public setLogFile(filePath: string): void {
    if (!filePath) return;
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.logFilePath = filePath;
      // Direct stderr write, not `write()`, to avoid recursion — and gated, because announcing
      // where the log goes is itself a log line nobody asked for on a read-only command.
      if (!Logger.quiet) {
        process.stderr.write(`\x1b[36m[Logger] Structural Diagnostic Sink anchored at: ${filePath}\x1b[0m\n`);
      }
    } catch (err) {
      process.stderr.write(`🛡️ [Logger] Failed to initialize log file: ${err}\n`);
    }
  }

  /** Append one line to the persistent sink. Never throws — a log loop must not crash a pulse. */
  private toFile(level: string, message: string): void {
    if (!this.logFilePath) return;
    try {
      fs.appendFileSync(this.logFilePath, `[${new Date().toISOString()}] [${level}] [${this.prefix}] ${message}\n`);
    } catch {
      // Silent fail on file append to prevent log-loop crashes
    }
  }

  /**
   * Levels quiet NEVER suppresses.
   *
   * Quiet exists to stop NARRATION, not to hide failures. Gating every level on it — the first
   * version of this — would have made a real error silent on the CLI, which is a far worse defect
   * than the noise it was fixing: the command would exit non-zero with nothing printed. A warning or
   * an error is the answer to the caller's question when things go wrong.
   */
  private static readonly ALWAYS_SHOWN = new Set(['WARN', 'ERROR', 'SUCCESS']);

  private write(level: string, message: string, colorCode: string = "37"): void {
    if (!this.enabled) return;

    // 1. MCP Standard: stderr. Quiet suppresses narration only — see ALWAYS_SHOWN.
    if (!Logger.quiet || Logger.ALWAYS_SHOWN.has(level)) {
      process.stderr.write(`\x1b[${colorCode}m[${this.prefix}] ${message}\x1b[0m\n`);
    }

    // 2. Persistent Vault: File Append 🏺 💎 — always, so quiet costs no diagnosability.
    this.toFile(level, message);
  }

  public info(message: string): void {
    this.write("INFO", message, "36"); // Cyan
  }

  public warn(message: string, error?: any): void {
    const errorMsg = error ? `: ${error.message || error}` : '';
    this.write("WARN", `⚠️  ${message}${errorMsg}`, "33"); // Yellow
  }

  public error(message: string, error?: any): void {
    const errorMsg = error ? `: ${error.message || error}` : '';
    this.write("ERROR", `❌ ${message}${errorMsg}`, "31"); // Red
  }

  public debug(message: string): void {
    if (process.env.DEBUG) {
      this.write("DEBUG", `[DEBUG] ${message}`, "90"); // Grey
    }
  }

  public success(message: string): void {
    this.write("SUCCESS", `✨ ${message}`, "32"); // Green
  }
}

export const logger = new Logger();
