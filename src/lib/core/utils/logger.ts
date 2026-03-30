/**
 * Conducks — Unified Logger
 * 
 * Ensures all logs are sent to stderr to prevent corruption of the MCP stdout stream.
 */
export class Logger {
  private prefix: string;
  private enabled: boolean;

  constructor(prefix: string = "Conducks", enabled: boolean = true) {
    this.prefix = prefix;
    this.enabled = enabled;
  }

  public info(message: string): void {
    if (this.enabled) {
      process.stderr.write(`\x1b[36m[${this.prefix}] ${message}\x1b[0m\n`);
    }
  }

  public warn(message: string): void {
    if (this.enabled) {
      process.stderr.write(`\x1b[33m[${this.prefix}] ⚠️  ${message}\x1b[0m\n`);
    }
  }

  public error(message: string, error?: any): void {
    if (this.enabled) {
      const errorMsg = error ? `: ${error.message || error}` : '';
      process.stderr.write(`\x1b[31m[${this.prefix}] ❌ ${message}${errorMsg}\x1b[0m\n`);
    }
  }

  public debug(message: string): void {
    if (this.enabled && process.env.DEBUG) {
      process.stderr.write(`\x1b[90m[${this.prefix}] [DEBUG] ${message}\x1b[0m\n`);
    }
  }

  public success(message: string): void {
    if (this.enabled) {
      process.stderr.write(`\x1b[32m\x1b[1m[${this.prefix}] ${message}\x1b[0m\n`);
    }
  }
}

export const logger = new Logger();
