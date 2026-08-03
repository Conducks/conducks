import chalk from 'chalk';

/**
 * The only capability this helper needs from the graph: name → candidate nodes.
 * Declared structurally so the CLI never names a core type (ADR 0005) — the concrete
 * `ConducksAdjacencyList` handed in by the registry satisfies it by shape.
 */
export interface NameIndex {
  findNodesByName(name: string): Array<{ id: string; properties?: unknown }>;
  /** Optional so existing callers that only index by name still satisfy the shape. */
  getNode?(id: string): { id: string } | undefined;
}

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
export function resolveSymbol(input: string, graph: NameIndex): string {
  if (input.includes('::')) {
    // Node ids are LOWERCASED on write (CONDUCKS-4, for APFS), so an id containing a real-cased
    // path — which is what a user copies out of their editor, and what every macOS temp dir has —
    // matched nothing and the command reported "not found" for a symbol that exists. Try the
    // verbatim id first so nothing that worked before changes, then the lowercased form, then fall
    // back to the bare name after `::` (ADR 0106).
    // RETURN THE NODE'S ID, NOT THE STRING THAT FOUND IT.
    //
    // `getNode` is lenient — it resolves an alias and a case-insensitive form — so a lookup can
    // SUCCEED while the input differs from the id it matched. Returning `input` handed every caller
    // a string no node is keyed by:
    //
    //   getNode('ROUTE::/users/profile::GET')  ->  found, real id `route::/users/profile::get`
    //   resolveSymbol(...)                     ->  returned 'ROUTE::/users/profile::GET'
    //
    // `impact` then walked from an id the graph does not hold and answered `server.ts@1` for a route
    // whose only real dependent is the REQUEST that calls it. The lookup was right; the return value
    // threw the answer away (ADR 0130).
    const direct = graph.getNode?.(input);
    if (direct) return direct.id;
    const lowered = input.toLowerCase();
    const loweredNode = graph.getNode?.(lowered);
    if (loweredNode) return loweredNode.id;
    if (!graph.getNode) return input;   // caller cannot check; preserve the old behaviour

    // A NAME CAN CONTAIN `::`. Synthesised nodes are named for WHAT THEY ARE rather than where they
    // live — `ROUTE::/users/profile::GET`, `REQUEST::/users/profile::GET` — so an input shaped like
    // an id may be a name, and the id lookups above can never match it.
    //
    // Without this the whole string fell through to the bare tail (`GET`) and the caller was handed
    // an id no node has: `impact 'ROUTE::/users/profile::GET'` reported the raw string as its
    // `symbolId` and then walked from nowhere, answering `server.ts` for a route whose only real
    // dependent is the REQUEST that calls it (ADR 0130).
    const named = graph.findNodesByName(input);
    if (named.length > 0) return named[0].id;

    const bare = input.slice(input.lastIndexOf('::') + 2);
    if (!bare) {
      cliError('SYMBOL_NOT_FOUND', `No symbol matching "${input}"`,
        `Run: conducks query "${input}" to find valid symbol IDs`);
    }
    return resolveSymbol(bare, graph);
  }

  const matches = graph.findNodesByName(input);
  if (matches.length === 0) {
    cliError(
      'SYMBOL_NOT_FOUND',
      `No symbol matching "${input}"`,
      `Run: conducks query "${input}" to find valid symbol IDs`
    );
  }

  // A DECLARATION beats a re-export of it.
  //
  // `export { allocateHostPort } from './host-port'` mints an ATOM on the export line, and gravity
  // alone could pick it over the BEHAVIOR that actually declares the function — so `explain
  // allocateHostPort` described an export statement, reporting `kind: ATOM` at the barrel's line
  // instead of the function at its own. Kind first, gravity second (ADR 0112).
  const DECLARATION_KINDS = new Set(['BEHAVIOR', 'STRUCTURE', 'INFRA', 'UNIT']);
  const isDeclaration = (n: { properties?: unknown }) =>
    DECLARATION_KINDS.has(String((n.properties as any)?.canonicalKind ?? ''));

  const preferred = matches.some(isDeclaration) ? matches.filter(isDeclaration) : matches;
  const best = preferred.reduce((a, b) => {
    const ga = (a.properties as any)?.gravity ?? 0;
    const gb = (b.properties as any)?.gravity ?? 0;
    return gb > ga ? b : a;
  });

  if (matches.length > 1) {
    cliWarn(`Multiple symbols named "${input}" — using highest-gravity match: ${best.id}`);
  }

  return best.id;
}
