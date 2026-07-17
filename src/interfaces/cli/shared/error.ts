import chalk from 'chalk';
import type { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

export function cliError(code: string, message: string, suggestion?: string): never {
  process.stderr.write(chalk.red(`[ERROR] ${code}: ${message}\n`));
  if (suggestion) process.stderr.write(chalk.yellow(`Suggestion: ${suggestion}\n`));
  process.exit(1);
}

export function cliWarn(message: string): void {
  process.stderr.write(chalk.yellow(`[WARN] ${message}\n`));
}

/**
 * Resolve a user-supplied symbol string to a node ID.
 * If input contains '::' treat as full node ID directly.
 * Otherwise use name index to find best match (highest gravity).
 * Exits with helpful error if no match found.
 */
export function resolveSymbol(input: string, graph: ConducksAdjacencyList): string {
  if (input.includes('::')) return input;

  const matches = graph.findNodesByName(input);
  if (matches.length === 0) {
    cliError(
      'SYMBOL_NOT_FOUND',
      `No symbol matching "${input}"`,
      `Run: conducks query "${input}" to find valid symbol IDs`
    );
  }

  // Pick highest-gravity node
  const best = matches.reduce((a, b) => {
    const ga = (a.properties as any)?.gravity ?? 0;
    const gb = (b.properties as any)?.gravity ?? 0;
    return gb > ga ? b : a;
  });

  if (matches.length > 1) {
    cliWarn(`Multiple symbols named "${input}" — using highest-gravity match: ${best.id}`);
  }

  return best.id;
}
