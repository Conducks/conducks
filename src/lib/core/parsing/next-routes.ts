import path from "node:path";

/**
 * Conducks — Next.js app-router routes, which no tree-sitter query can find (todo29#P5).
 *
 * Every route pattern in this codebase matches the EXPRESS shape: `app.get('/path', handler)` — a
 * call expression naming its own path. Next.js declares a route by FILE POSITION instead:
 * `app/api/onboarding/step/route.ts` exporting `GET` and `POST`. No call expression names the path,
 * so there is nothing for a query to capture and the route is invisible.
 *
 * Measured on mentorseed: **118 route files, ZERO route nodes.** conducks could see who CALLED an
 * endpoint and not who SERVED it, on the most common React stack — the cross-service pair was
 * half-blind exactly where it would be used most.
 *
 * Kept as pure functions over a path and a list of exported names, holding no parser and no
 * filesystem, because the derivation is where the interesting mistakes are: a dynamic segment, a
 * route group that must NOT appear in the URL, and a file that merely lives under `app/`.
 */

/** The HTTP methods Next.js recognises as route handlers. An export of any other name is not one. */
const HTTP_EXPORTS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Route files by convention. `page`/`layout` are UI, not endpoints. */
const ROUTE_BASENAMES = new Set(['route.ts', 'route.tsx', 'route.js', 'route.mjs']);

/**
 * The URL a Next.js route file serves, or null when the file is not one.
 *
 * Three conventions are honoured, and each is a way a naive `dirname` gets it wrong:
 *
 *   `[id]`      a DYNAMIC segment  ->  `:id`, matching how every other route in the graph writes a
 *               parameter, so a static route and a Next.js route are comparable.
 *   `[...slug]` a CATCH-ALL        ->  `:slug*`
 *   `(admin)`   a ROUTE GROUP      ->  REMOVED ENTIRELY. Parenthesised directories organise files
 *               and contribute nothing to the URL. Leaving them in produces a path that never
 *               matches a real request, which is worse than no route at all because it looks like
 *               a resolved one.
 *
 * The segment scan starts after the LAST `app/` or `src/app/`, so a repository with several apps —
 * `admin/src/app/...` and `app/src/app/...` on mentorseed — resolves each against its own root.
 */
export function nextRoutePath(filePath: string): string | null {
  const normalised = filePath.replace(/\\/g, '/');
  if (!ROUTE_BASENAMES.has(path.basename(normalised).toLowerCase())) return null;

  const parts = normalised.split('/');
  const appAt = parts.lastIndexOf('app');
  if (appAt === -1) return null;

  const segments = parts.slice(appAt + 1, -1)             // between `app/` and `route.ts`
    .filter(s => !(s.startsWith('(') && s.endsWith(')'))) // route groups contribute no URL
    .map(s => {
      const dynamic = /^\[(\.\.\.)?(.+?)\]$/.exec(s);
      if (!dynamic) return s;
      return dynamic[1] ? `:${dynamic[2]}*` : `:${dynamic[2]}`;
    });

  return '/' + segments.join('/');
}

/**
 * Which HTTP methods a route file serves, from the names it exports.
 *
 * Case-sensitive on purpose: Next.js only treats an UPPERCASE `GET` as a handler, and a lowercase
 * `get` export is an ordinary function. Accepting both would invent endpoints for any file that
 * happens to export a helper called `get` or `post`.
 */
export const nextRouteMethods = (exportedNames: readonly string[]): string[] =>
  exportedNames.filter(n => HTTP_EXPORTS.has(n));

/** Every (method, path) pair a file serves. Empty when it is not a route file or exports no handler. */
export function nextRoutes(filePath: string, exportedNames: readonly string[]): Array<{ method: string; path: string }> {
  const routePath = nextRoutePath(filePath);
  if (!routePath) return [];
  return nextRouteMethods(exportedNames).map(method => ({ method, path: routePath }));
}
