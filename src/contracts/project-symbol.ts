/**
 * Conducks — is this id a symbol of THIS project, or something outside it? ONE rule, every surface. 🏺
 *
 * The graph deliberately holds nodes for things it does not own: language built-ins (`global::set`),
 * package namespaces (`react::usestate`, `typing::list`), unresolved targets
 * (`external://unresolved/os.uptime`) and synthesised endpoints (`route::/api/users::get`). They are
 * real and worth keeping — `impact` reports them as reach, and deleting them would hide how much of
 * a call chain leaves the codebase.
 *
 * What they are not is CODE THIS PROJECT CONTAINS, and any count captioned as project symbols has to
 * say so. MEASURED on the sofie subject: 2,071 of 23,042 flow members (8%) were synthesised, and
 * `flows --min-members 5` filtered on the inflated total — so a "flow" of five built-ins passed a
 * filter meant to remove noise, which is the opposite of what the flag is for.
 *
 * Lives in `contracts` because `interfaces/cli` and `interfaces/tools` both need it and may not
 * import each other (ADR 0005) — the same reason `tryResolveSymbol` and `realCasePath` live here.
 * The CLI and the MCP tool were filtering the same flows with the same inflated number; one rule in
 * one place is what stops them answering differently later (ADR 0148).
 */

/** Namespaces this tool SYNTHESISES. An id under one of them names no file in the repository. */
const SYNTHESISED_NAMESPACES = new Set([
  'global', 'external', 'typing', 'unresolved', 'lib', 'ecosystem', 'taxonomy', 'route', 'request',
  'directory', 'repository', 'member',
]);

/**
 * True when the id names a symbol declared in this repository.
 *
 * A project id is `<absolute file path>::<symbol>`, so it carries a path separator in its file half.
 * Everything else — a scheme (`external://…`), a synthesised namespace, or a bare dotted target the
 * linker could not place (`ipcmain.handle`) — is outside.
 */
export function isProjectSymbolId(id: string): boolean {
  const raw = String(id ?? '');
  if (!raw) return false;
  if (raw.includes('://')) return false;

  const sep = raw.lastIndexOf('::');
  if (sep < 0) return false;                       // `ipcmain.handle` — an unplaced reference

  const filePart = raw.slice(0, sep);
  if (SYNTHESISED_NAMESPACES.has(filePart.toLowerCase())) return false;

  // A real file half is an ABSOLUTE path. Requiring only a separator let PACKAGE namespaces through —
  // `next/server::nextresponse`, `next/link::default`, `@heroicons/react/24/outline::checkcircleicon`
  // all carry a slash and name no file in this repository. Caught by reading `advise`'s hub list on
  // the orchestrator subject, where four of them were being reported as splittable hubs.
  return /^([/\\]|[A-Za-z]:[/\\])/.test(filePart);
}

/** How many of these ids are this project's own code, and how many are not. */
export function splitProjectSymbols(ids: readonly string[]): { project: string[]; external: string[] } {
  const project: string[] = [];
  const external: string[] = [];
  for (const id of ids) (isProjectSymbolId(id) ? project : external).push(id);
  return { project, external };
}
