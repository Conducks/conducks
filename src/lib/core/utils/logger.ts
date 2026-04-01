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
      // Use direct stderr write for the first initialization log to avoid recursion
      process.stderr.write(`\x1b[36m[Logger] Structural Diagnostic Sink anchored at: ${filePath}\x1b[0m\n`);
    } catch (err) {
      process.stderr.write(`🛡️ [Logger] Failed to initialize log file: ${err}\n`);
    }
  }

  private write(level: string, message: string, colorCode: string = "37"): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level}] [${this.prefix}] ${message}\n`;
    const colored = `\x1b[${colorCode}m[${this.prefix}] ${message}\x1b[0m\n`;

    // 1. MCP Standard: stderr
    process.stderr.write(colored);

    // 2. Persistent Vault: File Append 🏺 💎
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, formatted);
      } catch (err) {
        // Silent fail on file append to prevent log-loop crashes
      }
    }
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
