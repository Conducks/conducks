import { isTestNode } from "@/contracts/test-path.js";

/**
 * Conducks — how a caller-supplied symbol becomes a node id. ONE rule, both surfaces. 🏺
 *
 * It lived in `interfaces/cli/shared/error.ts` and the MCP surface carried a SECOND copy. They
 * drifted the moment either was fixed: teaching the CLI to honour a repo-relative id
 * (`src/kernel/index.ts::createLogger`) left the tools rejecting the same input, which the mirror
 * rule forbids — same input, same answer, differing only in rendering (ADR 0148, todo61).
 *
 * It sits in `contracts` because that is the only layer both `cli` and `mcp` may import (ADR 0005);
 * the architecture test refused `mcp -> cli` directly, which is how the right home was found.
 *
 * Pure over the `NameIndex` shape and a warning SINK. The CLI passes its `cliWarn`, the tools pass
 * nothing — the rule is the same, only the rendering differs, which is exactly what the mirror rule
 * permits.
 */
/**
 * The only capability this helper needs from the graph: name → candidate nodes.
 * Declared structurally so the CLI never names a core type (ADR 0005) — the concrete
 * `ConducksAdjacencyList` handed in by the registry satisfies it by shape.
 */
export interface NameIndex {
  findNodesByName(name: string): Array<{ id: string; properties?: unknown }>;
  /** Optional so existing callers that only index by name still satisfy the shape. */
  getNode?(id: string): { id: string } | undefined;
  /**
   * Every node id, for resolving an input that IS an id rather than a name.
   *
   * Optional for the same reason `getNode` is: a caller that cannot supply it keeps the old
   * name-based behaviour. See the relative-id branch below for what it fixes.
   */
  allNodeIds?(): Iterable<string>;
}


/**
 * The same resolution, returning `null` instead of exiting.
 *
 * `explain` and `entropy` print their own "not found in the Synapse" wording, which their tests
 * assert on, so they could not call `resolveSymbol` — it exits with different text. What they did
 * instead was guard it behind `findNodesByName(input).length > 0`, and **that guard silently broke
 * every `path/file.ts::name` id**: `findNodesByName` matches a NAME, an id is not a name, so it
 * returned `[]`, the guard failed, and the resolver that DOES handle `::` was never reached.
 *
 * MEASURED: `status` prints `electron/main/index.ts::registeripchandlers` as the top hotspot;
 * `impact`, `trace` and `context` accept it; `explain` and `entropy` answered "not found in the
 * Synapse" for a symbol sitting in the graph. The id a command PRINTS must be an id its sibling
 * commands ACCEPT.
 *
 * One resolution rule, two error policies — rather than a second copy of the rule that drifts.
 */
export function tryResolveSymbol(
  input: string,
  graph: NameIndex,
  warn?: (message: string) => void,
  // How to render an id in the WARN text below. Defaults to identity so a caller that does not
  // supply one gets byte-identical output to before this parameter existed — the CLI is the only
  // caller that has a repair to offer (`displayId`, `interfaces/cli/shared/display-path.ts`), and
  // this module may not import it: it sits in `contracts` precisely so `mcp` and `cli` share ONE
  // resolution rule (ADR 0005), and a direct import would recreate the drift that rule exists to
  // prevent. Threading a formatter keeps that rule in one place while letting each surface render
  // the ids in the warning however it renders ids everywhere else.
  formatId: (id: string) => string = id => id,
): string | null {
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
    if (!bare) return null;

    // A RELATIVE id is qualified BY ITS FILE, and that half was being thrown away.
    //
    // Ids are absolute, so `src/kernel/index.ts::createLogger` matches none of the lookups above and
    // fell straight through to the bare name — where gravity picks a winner that may live in a
    // different file entirely. MEASURED on a real subject with two `createLogger` declarations:
    // asking for the one in `src/kernel/index.ts` answered with `src/kernel/logger/index.ts`, and a
    // FABRICATED path gave byte-identical output. The qualification was decoration.
    //
    // It matters more than a typo, because `status` PRINTS relative ids (ADR 0132) and the rule
    // stated at the top of this function is that a printed id must be an accepted one.
    //
    // Matched as a path SUFFIX: the user has a repo-relative path and the graph has an absolute one.
    const sep = input.lastIndexOf('::');
    // Leading slashes are STRIPPED before matching, and that is not tidiness. On macOS a temp path
    // is `/var/folders/...` while its resolved form — which is what the vault stores — is
    // `/private/var/folders/...`. Comparing with the leading slash kept makes an absolute id fail to
    // match its own node, and this branch then reported SYMBOL_NOT_FOUND for a symbol that exists:
    // six rename tests, all passing a real absolute id. Suffix matching from the first real segment
    // handles the relative form and the symlinked-prefix form with one rule.
    const qualifier = input.slice(0, sep).toLowerCase()
      .replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    // Only when the left side LOOKS like a file. `MyClass::method` is a qualifier too and is not a
    // path — the bare-name fallback exists for exactly that (ADR 0106) and must survive.
    const looksLikePath = qualifier.includes('/') || /\.[a-z0-9]+$/.test(qualifier);
    if (looksLikePath) {
      // MATCH THE ID, because the input IS an id. The name-based search below cannot answer two
      // shapes that `status` and `query` print every day:
      //
      //   - a LOWERCASED name. Ids are lowercased on write, so the top hotspot prints as
      //     `src/core/service/hands.py::hands` while the class is `Hands` — and the name index is
      //     keyed by the real spelling, with a substring fallback that caps at 20 hits and can
      //     answer with none of them in the right file.
      //   - a DOTTED MEMBER id, `mapper_runner.py::mapperrunner.explore`. No node is NAMED
      //     `mapperrunner.explore`; the name is `explore` and the qualifier is part of the id.
      //
      // MEASURED on the scraper subject: `status` printed both of those, and `trace`, `explain` and
      // `entropy` answered SYMBOL_NOT_FOUND for both — while the same commands accepted them on the
      // sofie subject, whose top symbol happens to be all-lowercase already. The rule this file
      // opens with is that an id a command PRINTS must be an id its siblings ACCEPT.
      const wantedTail = `::${bare.toLowerCase()}`;
      const idMatches: string[] = [];
      for (const id of graph.allNodeIds?.() ?? []) {
        const lower = String(id).toLowerCase().replace(/\\/g, '/');
        if (!lower.endsWith(wantedTail)) continue;
        const idFile = lower.slice(0, lower.lastIndexOf('::')).replace(/^\/+/, '');
        if (idFile === qualifier || idFile.endsWith(`/${qualifier}`) || qualifier.endsWith(`/${idFile}`)) {
          idMatches.push(String(id));
        }
      }
      if (idMatches.length === 1) return idMatches[0];
      // Several ids share that tail in that file only when one is a member of another
      // (`x.ts::foo` and `x.ts::bar.foo`); prefer the exact one the caller spelled.
      if (idMatches.length > 1) {
        const exact = idMatches.find(id => id.toLowerCase().endsWith(`/${qualifier}${wantedTail}`));
        return exact ?? idMatches[0];
      }

      const inFile = graph.findNodesByName(bare).filter(n => {
        const id = String(n.id).toLowerCase().replace(/\\/g, '/');
        const idFile = id.slice(0, id.lastIndexOf('::')).replace(/^\/+/, '');
        // EITHER direction, because either side may carry the longer prefix: the reader types the
        // repo-relative path the tool printed, or pastes a resolved `/private/var/...` path whose
        // vault form is the shorter `/var/...`, or the reverse. Both are the same file.
        return idFile === qualifier
          || idFile.endsWith(`/${qualifier}`)
          || qualifier.endsWith(`/${idFile}`);
      });
      // A path that holds nothing by that name is a MISS, not a hint to guess elsewhere. Answering
      // the gravity pick here is how a typo produced a confident report about a different symbol.
      if (inFile.length === 0) return null;
      if (inFile.length === 1) return inFile[0].id;
      // Several in one file (an overload, a re-export beside the declaration): let the ordinary
      // preference rules below decide, rather than inventing a second ranking here.
    }

    return tryResolveSymbol(bare, graph, warn, formatId);
  }

  const matches = graph.findNodesByName(input);
  if (matches.length === 0) return null;

  // A DECLARATION beats a re-export of it.
  //
  // `export { allocateHostPort } from './host-port'` mints an ATOM on the export line, and gravity
  // alone could pick it over the BEHAVIOR that actually declares the function — so `explain
  // allocateHostPort` described an export statement, reporting `kind: ATOM` at the barrel's line
  // instead of the function at its own. Kind first, gravity second (ADR 0112).
  const DECLARATION_KINDS = new Set(['BEHAVIOR', 'STRUCTURE', 'INFRA', 'UNIT']);
  // A DECLARATION beats a re-export of it: `export { x } from './x'` mints an ATOM on the export
  // line, and gravity alone could pick it over the function that actually declares `x`.
  const isDeclaration = (n: { properties?: unknown }) =>
    DECLARATION_KINDS.has(String((n.properties as any)?.canonicalKind ?? ''));

  const preferred = matches.some(isDeclaration) ? matches.filter(isDeclaration) : matches;

  // SOURCE BEATS TEST (todo43). On a repository with 189 suites the tests outnumber the sources,
  // and gravity follows edge count, not authority — so `impact format` resolved to
  // `boundaries.test.ts::format`, a test file's local, over the real declaration. A test file
  // mentioning a name is not the same claim as a source file declaring it. Only when NO source
  // candidate exists may a test symbol win, so asking about a test helper still answers.
  const fromSource = preferred.filter(n => !isTestNode(n));
  const pool = fromSource.length > 0 ? fromSource : preferred;

  const best = pool.reduce((a, b) => {
    const ga = (a.properties as any)?.gravity ?? 0;
    const gb = (b.properties as any)?.gravity ?? 0;
    return gb > ga ? b : a;
  });

  if (matches.length > 1) {
    // Name what was PASSED OVER, not only what was chosen (todo43). A reader who disagrees with
    // the pick needs the alternatives to disagree with — without them the warning says "trust me".
    // Capped at three: past that, `query` is the tool.
    const passedOver = matches.filter(m => m.id !== best.id).slice(0, 3).map(m => formatId(m.id));
    const more = matches.length - 1 - passedOver.length;
    warn?.(`Multiple symbols named "${input}" — using highest-gravity match: ${formatId(best.id)}` +
      (passedOver.length ? `\n  passed over: ${passedOver.join(', ')}${more > 0 ? ` (+${more} more)` : ''}` : ''));
  }

  return best.id;
}
