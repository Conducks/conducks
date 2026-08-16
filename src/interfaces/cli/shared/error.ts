import chalk from 'chalk';
import { tryResolveSymbol, type NameIndex } from "@/contracts/index.js";

export function cliError(code: string, message: string, suggestion?: string): never {
  process.stderr.write(chalk.red(`[ERROR] ${code}: ${message}\n`));
  if (suggestion) process.stderr.write(chalk.yellow(`Suggestion: ${suggestion}\n`));
  process.exit(1);
}

export function cliWarn(message: string): void {
  process.stderr.write(chalk.yellow(`[WARN] ${message}\n`));
}

/**
 * Resolve a user-supplied symbol string to a node id, or EXIT with the CLI's error shape.
 *
 * The RULE moved to `contracts/symbol-resolution.ts` — the MCP surface carried a second copy of it
 * and the two drifted the moment either was fixed (todo61's mirror rule). What stays here is what
 * only the CLI owns: the exit code and the warning sink.
 */
export function resolveSymbol(input: string, graph: NameIndex): string {
  const resolved = tryResolveSymbol(input, graph, cliWarn);
  if (resolved === null) {
    cliError('SYMBOL_NOT_FOUND', `No symbol matching "${input}"`,
      `Run: conducks query "${input}" to find valid symbol IDs`);
  }
  return resolved;
}

export { tryResolveSymbol, type NameIndex } from "@/contracts/index.js";
