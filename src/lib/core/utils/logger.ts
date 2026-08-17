import fs from 'node:fs';
import path from 'node:path';

/**
 * Every diagnostic conducks writes, and the two places it can go.
 *
 * STDERR, NEVER STDOUT. The MCP server speaks JSON-RPC on stdout, so a single stray `console.log`
 * corrupts the protocol for the whole session — which is why this exists as a class rather than as a
 * convention nobody can enforce.
 *
 * A FILE SINK ALONGSIDE IT, always written, never suppressed. That is what makes `setQuiet` safe: a
 * quiet command still leaves a full record in `.conducks/mcp.log`, so silence costs noise rather
 * than diagnosability.
 */
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
 * MODULE-LEVEL, and private to this file. It belongs to the PROCESS, not to one logger — a
 * per-instance flag silenced four of the five boot lines and left the fifth printing from an
 * instance nobody had a handle to. It lives outside the class rather than as a static so that no
 * holder of a `Logger` can reach it: the only way in is `setProcessQuiet` (ADR 0150 rule 4).
 */
let quiet = false;

export class Logger {
  private prefix: string;
  private enabled: boolean;
  private logFilePath: string | null = null;

  /**
   * A startup diagnostic: to the terminal only when not quiet, to the file sink always.
   *
   * Exists because the noisiest lines were raw `process.stderr.write` calls made before any logger
   * was configured, so they could not be silenced by a level or a flag — the bootstrapper wrote
   * straight to the file descriptor.
   */
  public boot(message: string): void {
    if (!quiet) process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
    this.toFile('BOOT', message.replace(/\n$/, ''));
  }

  /** `prefix` names the subsystem in every line it writes; `enabled: false` mutes an instance whole. */
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
      if (!quiet) {
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

  /**
   * The one path every level goes through, and therefore the one place quiet is decided.
   *
   * Both sinks always run: the terminal write is conditional, the file append is not. A level added
   * later inherits both behaviours without a second decision, which is the reason the six public
   * methods below carry no logic of their own.
   */
  private write(level: string, message: string, colorCode: string = "37"): void {
    if (!this.enabled) return;

    // 1. MCP Standard: stderr. Quiet suppresses narration only — see ALWAYS_SHOWN.
    if (!quiet || Logger.ALWAYS_SHOWN.has(level)) {
      process.stderr.write(`\x1b[${colorCode}m[${this.prefix}] ${message}\x1b[0m\n`);
    }

    // 2. Persistent Vault: File Append 🏺 💎 — always, so quiet costs no diagnosability.
    this.toFile(level, message);
  }

  /**
   * The six levels. Each is a colour and a label over `write` — the behaviour lives there, and the
   * only real differences are here: `warn` and `error` accept an error to append, `debug` is gated
   * on `DEBUG` so it costs nothing when unset, and WARN, ERROR and SUCCESS are never suppressed by
   * quiet (see `ALWAYS_SHOWN`).
   */
  public info(message: string): void {
    this.write("INFO", message, "36"); // Cyan
  }

  /** Takes an optional error to append, and is never suppressed by quiet — see `ALWAYS_SHOWN`. */
  public warn(message: string, error?: any): void {
    const errorMsg = error ? `: ${error.message || error}` : '';
    this.write("WARN", `⚠️  ${message}${errorMsg}`, "33"); // Yellow
  }

  /** Same shape as `warn`, and equally unsuppressible: a command must not exit non-zero in silence. */
  public error(message: string, error?: any): void {
    const errorMsg = error ? `: ${error.message || error}` : '';
    this.write("ERROR", `❌ ${message}${errorMsg}`, "31"); // Red
  }

  /** Gated on `DEBUG`, so it costs a single env read when unset rather than a formatted string. */
  public debug(message: string): void {
    if (process.env.DEBUG) {
      this.write("DEBUG", `[DEBUG] ${message}`, "90"); // Grey
    }
  }

  /** An outcome, not narration — which is why quiet leaves it visible. */
  public success(message: string): void {
    this.write("SUCCESS", `✨ ${message}`, "32"); // Green
  }
}

export const logger = new Logger();

/**
 * Silence the process, or stop silencing it.
 *
 * A FUNCTION rather than a method, and that is the whole point of it (ADR 0150 rule 4). The flag is
 * static because quietness belongs to the process — a per-instance flag silenced four of the five
 * boot lines and left the fifth printing from an instance nobody had a handle to. But while it was
 * set THROUGH an instance method, any of the seventeen places that build a logger could flip it for
 * everyone, and a `new Logger("ConducksGraph").setQuiet(true)` reads as a local decision while
 * having a global effect. Naming it at module level makes the reach visible at the call site.
 *
 * One caller: the CLI, which decides per command whether narration is wanted. The MCP server does
 * NOT call it — there, stderr is the only legal log sink and the lines are the only way to see what
 * the server is doing.
 */
export function setProcessQuiet(enabled: boolean): void { quiet = enabled; }
