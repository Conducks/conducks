import path from "node:path";
import { chronicle } from "@/lib/core/git/index.js";
import { getProjectRelativePath } from "@/lib/core/utils/index.js";

/**
 * Conducks — what a tree-sitter MATCH says, read off it and returned as a plain value.
 *
 * Nine pure functions that were the first 337 lines of `reflector.ts`. They share one property and
 * it is the reason they are a module: none of them touches the spectrum, the graph, the context or
 * any processor. A node or a match goes in; a string, a record or a list comes out.
 *
 * WHY THEY MOVED. `reflector.ts` was 1,696 lines and its `reflect()` method alone was 1,215 of them,
 * which is the number that actually makes the file hard to change. Extracting these does not fix
 * that — it is the part of the split that can be done WITHOUT touching dispatch, so it is the part
 * that is safe to do first. The method is still the work, and it still has its own todo.
 *
 * They were internal to the reflector and stay that way: nothing outside `core/parsing` imports this
 * file, and the parsing door does not export it. The nine names appear elsewhere in the repository
 * only inside comments — `paramsOf` is named in four language query files explaining what its
 * fallback chain does and does not check, which is documentation of a contract rather than a caller.
 *
 * Each function keeps the reasoning that was written above it, because that reasoning is the reason
 * the function looks the way it does.
 */
/**
 * A `fingerprint` is a symbol's STRUCTURAL identity, so the only path term it may carry is the one
 * that describes where the symbol sits IN THE PROJECT — never where the project sits on this disk.
 *
 * All four fingerprint sites in this file used to hash the ABSOLUTE `file.path`. Measured on two
 * real layers of this repo's own vault: `fingerprint` differed on 82.8% of rows across UNCHANGED
 * files while `dna`, its only content input, was identical on 3,613 of 3,613 — the churn was
 * entirely the path term. Two things broke because of it:
 *
 *  1. A vault was not portable. Clone or move the checkout and every symbol read as new.
 *  2. Rename/move detection cannot fire. `drift-engine.ts:69` joins
 *     `c.fingerprint = p.fingerprint AND c.nodeId != p.nodeId` — literally "same structure, moved" —
 *     and a move changes the path, hence the fingerprint, so the join matches nothing.
 *
 * **This change fixes (1) and NOT (2).** Measured, so it is not left as an assumption: portability
 * is now 4,559 of 4,559 symbols identical across two different absolute roots, but 0 of 19 symbols
 * keep their fingerprint when a file moves directory INSIDE one root — a relative path still
 * changes on a move. `conducks drift` still reports "Renamed/Moved: 0".
 *
 * And the obvious repair is measurably wrong: dropping the path term to leave `name|dna` puts
 * 2,533 of 4,559 symbols (55.6%) into a colliding bucket — 536 buckets, worst 79-way (`id` x79,
 * `constructor` x47). Fed to that join, rename detection would be almost entirely noise. A move key
 * therefore needs its OWN column with more entropy than name+dna, beside `fingerprint` rather than
 * instead of it. Carried as a spec, not built here.
 *
 * The root is NOT lower-cased before `path.relative` runs: on a case-sensitive filesystem
 * `relative('/users/x/repo', '/Users/X/repo/src/a.ts')` walks out of the tree and back in, which
 * would put the absolute path straight back into the hash. Lower-case the RESULT instead.
 *
 * When there is no project dir (no git, no anchor) this returns the absolute path — the pre-existing
 * behaviour — rather than resolving against `cwd`, because a fingerprint that silently changes with
 * the working directory is worse than one that is honestly machine-local.
 */
export function structuralPath(filePath: string): string {
  const root = chronicle.getProjectDir();
  if (!root) return filePath;
  return getProjectRelativePath(filePath, root).toLowerCase();
}

/**
 * Conducks — Structural Reflector
 * 
 * Orchestrates the induction wave and ensures the synapse resonance
 * is broadcast to the Mirror visual interface.
 */
/** A tree-sitter `(string)` capture keeps its delimiters; route and URL comparisons must not. */
export const stripQuotes = (v: string): string => v.replace(/^['"`]|['"`]$/g, '');

/**
 * Turn whatever a grammar calls the HTTP verb into the verb.
 *
 * Each language names its own route construct — Spring's `@GetMapping`, Go's `HandleFunc`, Flask's
 * `@app.route`, Rails' `resources` — but the VERB those imply is not language-specific, so the
 * mapping belongs here rather than in ten query files. Anything unrecognised stays as-is and is
 * uppercased, which keeps an unknown framework matching itself rather than silently becoming GET.
 */
export const normalizeHttpMethod = (raw: string | undefined): string => {
  const v = (raw ?? 'GET').replace(/Mapping$|Attribute$/, '').toUpperCase();
  if (v === 'REQUEST' || v === 'ROUTE' || v === 'HANDLEFUNC' || v === 'HANDLE') return 'GET';
  return v;
};

/** The `<scope.>name` a variable's node id is built from — the scope prefix is what makes it unique. */
export const scopedVarKey = (scope: string | null | undefined, name: string): string =>
  `${scope ? `${scope.toLowerCase()}.` : ''}${name.trim().toLowerCase()}`;

/**
 * An interface's members and their declared types: `{ nodes: 'SpectrumNode[]', meta: 'Meta' }`.
 *
 * The missing middle step in a chain the source states completely. `spectrum: PrismSpectrum` gives
 * the receiver's type, `.nodes` is declared on that interface as `SpectrumNode[]`, and `.find` is an
 * Array method — three declarations, no inference. 293 unresolved references on this repository were
 * that shape (todo36).
 *
 * A METHOD signature is skipped: `run(): void` declares a callable, not a member whose type another
 * hop can be resolved against, and the call to it resolves by the ordinary member lookup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memberTypesOf(bodyNode: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < (bodyNode?.namedChildCount ?? 0); i++) {
    const member = bodyNode.namedChild(i);
    if (member?.type !== 'property_signature') continue;
    const name = member.childForFieldName('name')?.text;
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    const declared = member.childForFieldName('type')?.text?.replace(/^\s*:\s*/, '').trim();
    if (declared) out[name.toLowerCase()] = declared.toLowerCase();
  }
  return out;
}

/**
 * Which identifier each property PATH of an object literal ultimately names.
 *
 * A DI container is an object literal, and `container.services.registry.lookup()` has no dynamic hop
 * in it — every property name is written in the source. It had been filed under "dynamic dispatch,
 * deliberately unhandled" alongside `handlers[key]()`, which genuinely IS dynamic. Only one of the
 * two deserved the label, and the mislabel kept it unexamined (todo30).
 *
 * Returns `{ "services.registry": "reg", "infrastructure.db": "database" }` — a path to the bare
 * identifier it aliases, which is the same relationship `export { x as y }` records.
 *
 * Three things are deliberately NOT recorded, because each would be a guess rather than a read:
 *   a COMPUTED key (`[key]: fn`)      — that is the `handlers[key]()` case, correctly refused;
 *   a value that is a call or an expression (`made: makeThing()`) — it states no identifier;
 *   a getter whose body is anything but a single `return <identifier>`.
 *
 * Those last two still record their PATH with an EMPTY value. The property is demonstrably wired
 * even though its type is unknown, and dead-code needs to know the name is reachable while the
 * resolver must not use it. An empty string says exactly that: wired, type unstated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function objectPathsOf(objectNode: any): Record<string, string> {
  const out: Record<string, string> = {};

  // Depth-first with a PREFIX, because an object literal's shape is a path — `container.db.query`
  // is one wiring fact, and losing the prefix loses which property chain reached it.
  const walk = (node: any, prefix: string, depth: number): void => {
    // A container nests a few levels; a deep literal is data, not wiring.
    if (!node || depth > 6) return;
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (!child) continue;

      if (child.type === 'pair') {
        const keyNode = child.childForFieldName('key');
        // A computed key names no property at parse time.
        if (!keyNode || keyNode.type === 'computed_property_name') continue;
        const key = keyNode.text;
        if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        const value = child.childForFieldName('value');
        if (!value) continue;
        if (value.type === 'object') { walk(value, path, depth + 1); continue; }
        if (value.type === 'identifier') { out[path.toLowerCase()] = value.text.toLowerCase(); continue; }

        // A DELEGATING property: `status: () => governance.status()`. The arrow forwards to another
        // call, written literally — the dominant shape in a hand-wired DI container, and the reason
        // 107 chains still dangled after the object-literal walk landed. What is recorded is the
        // CALLEE, so `audit.status` points at `governance.status` and the linker resolves that the
        // way it resolves any other call target.
        //
        // Only a single expression or a single `return <call>`. An arrow with real logic states no
        // delegation, and guessing which of several calls it stands for is the guess ADR 0070 refuses.
        if (value.type === 'arrow_function') {
          const body = value.childForFieldName('body');
          const call = body?.type === 'call_expression'
            ? body
            : (body?.namedChildCount === 1 && body.namedChild(0)?.type === 'return_statement'
                && body.namedChild(0).namedChildCount === 1
                && body.namedChild(0).namedChild(0)?.type === 'call_expression')
              ? body.namedChild(0).namedChild(0)
              : null;
          const callee = call?.childForFieldName('function')?.text;
          out[path.toLowerCase()] = callee && /^[A-Za-z_$][\w$.]*$/.test(callee) ? callee.toLowerCase() : '';
          continue;
        }
        out[path.toLowerCase()] = '';
        continue;
      }

      // A GETTER whose body is a single `return <identifier>` is an alias in object form.
      if (child.type === 'method_definition') {
        const name = child.childForFieldName('name')?.text;
        if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
        const path = prefix ? `${prefix}.${name}` : name;
        // The LAST return, not the only statement. A getter that guards or logs before returning a
        // binding is still an alias — `get graphEngine() { /* comment */ ...; return graph; }` names
        // `graph` exactly as plainly as a one-liner does. Requiring a single statement recorded
        // nothing for most of a real DI container (todo34).
        //
        // Still refused: a getter returning a CALL or an expression, and one with more than one
        // return, where which binding it names is not stated.
        const body = child.childForFieldName('body');
        const returns: any[] = [];
        for (let k = 0; k < (body?.namedChildCount ?? 0); k++) {
          const st = body.namedChild(k);
          if (st?.type === 'return_statement') returns.push(st);
        }
        const only = returns.length === 1 ? returns[0] : null;
        const returned = only && only.namedChildCount === 1 ? only.namedChild(0) : null;
        out[path.toLowerCase()] = returned?.type === 'identifier' ? returned.text.toLowerCase() : '';
      }
    }
  };

  walk(objectNode, '', 0);
  return out;
}

/**
 * The parameters a function/method declares: name, declared type, and whether it is optional.
 *
 * `dna.params` was the literal `[]` for every function in the graph — the same fabrication as the
 * old `returns: 'void'`, and `taxonomy.ts` DOCUMENTS parameters as living here, so the empty array
 * read as "this function takes none" rather than as "nobody looked" (ADR 0086).
 *
 * THE NAME IS CARVED, NOT LOOKED UP (ADR 0087). The first version tried the `pattern` field, then
 * `name`, then the node's own text — and eleven languages proved that chain wrong in BOTH
 * directions at once:
 *
 *   Python `a: str`   has NO `name` field, so it fell through to the text -> "a: str", type included
 *   Ruby   `*args`    HAS a `name` field, so it took it        -> "args", the marker gone
 *
 * An absent field forced the honest answer; a present one skipped it. Same for PHP's `&$c` and
 * `...$rest`, and for C's `int a` (the name is under a `declarator` field, a fourth shape).
 *
 * So the annotation is REMOVED instead: take the parameter's own text and cut out the `type` node
 * and any default value, by byte offset. Whatever is left is the name, markers and all. The type
 * sits on either side depending on the language — a suffix in TypeScript, Python and Rust, a PREFIX
 * in C, Go and Java — so whichever side survives the cut is the answer. Nothing is guessed: the
 * annotation's position is read from the parse tree.
 *
 * A parameter that is ENTIRELY its type keeps nothing and is not a parameter at all. That is C's
 * `f(void)`, which otherwise recorded one parameter named "void" for a function taking none.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * The kind a definition capture declares — with one correction the capture name cannot make itself.
 *
 * A FUNCTION BOUND TO A NAME IS STILL A FUNCTION. `export const Button: React.FC = (props) => {...}`
 * is how most of a React or Next.js codebase declares its functions, and the grammar tags it
 * `@isVariable` because syntactically it IS a variable declarator. Measured on the frozen subjects:
 * 123 PascalCase atoms in orchestrator's `.tsx` files against 128 BEHAVIOR nodes across all 198 of
 * them. `impact`, `prune`, `coverage` and `flows` all select on BEHAVIOR, so a React codebase was
 * largely invisible to the commands this project leads with.
 *
 * The evidence is the grammar's own and not a name heuristic: a declarator whose value is an arrow
 * function captures a PARAMETER LIST, and a plain variable captures none. A declaration carrying
 * parameters is a function in any language, which is why this lives here and not in one query file.
 *
 * Stated once because TWO sites derive the kind from a capture name — node creation and the capture
 * loop that overwrites it — and fixing only the first changed nothing at all.
 */
export function kindFromCapture(captureName: string, match: any): string {
  const kind = captureName.slice(2).toLowerCase();
  if (kind !== 'variable') return kind;
  const hasParams = match?.captures?.some((c: any) => c.name === 'params' || c.name === 'params_inline');
  return hasParams ? 'function' : kind;
}

/**
 * The parameters a match declares, carved from the capture rather than looked up (ADR 0087).
 *
 * A name is taken from the tree at the position the query captured. Resolving it against anything
 * else is what produced parameters belonging to a different function of the same name.
 */
export function paramsOf(match: any): Array<{ name: string; type: string | null; optional: boolean }> {
  // TWO capture forms, because one grammar has no parameter-list node at all.
  //
  //   @params         a dedicated list node — EVERY named child is a parameter. Ten languages.
  //   @params_inline  the function node ITSELF, whose parameters sit among its name, return type
  //                   and body. Swift only: tree-sitter-swift provides no wrapper (ADR 0088).
  //
  // The inline form filters children by node TYPE rather than guessing from shape — a heuristic
  // like "has a type field" would silently drop Ruby's bare `identifier` parameters.
  const listNode = match.captures?.find((c: any) => c.name === 'params')?.node;
  const inlineNode = listNode ? null : match.captures?.find((c: any) => c.name === 'params_inline')?.node;
  const node = listNode ?? inlineNode;
  if (!node) return [];

  const out: Array<{ name: string; type: string | null; optional: boolean }> = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (inlineNode && !/parameter/.test(child.type)) continue;

    const typeNode = child.childForFieldName('type');
    const declared = typeNode?.text?.replace(/^\s*(:|->)\s*/, '').trim() || null;
    const optional = child.type === 'optional_parameter';

    // Go writes `func f(a, b string)` as ONE node with TWO `name` children sharing one type.
    // Reading only the first silently dropped `b` — an arity this graph would then state wrongly.
    // Swift ALIASES the `name` field onto the type as well, so a plain read returns
    // ["a", "Int"] for `a: Int` and the type was emitted as a second parameter. Excluding the type
    // node by identity fixes it without a per-language branch — the same defence Go's real grouped
    // declaration passes untouched, since there the type is a separate field.
    const named: any[] = (typeof child.childrenForFieldName === 'function'
      ? child.childrenForFieldName('name') ?? []
      : []).filter((n: any) => !typeNode || n.startIndex !== typeNode.startIndex);
    if (named.length > 1) {
      for (const n of named) out.push({ name: n.text, type: declared, optional });
      continue;
    }

    // Cut the annotation and the default value out of the parameter's own span.
    const valueNode = child.childForFieldName('value')
      ?? child.childForFieldName('default_value')
      ?? child.childForFieldName('right');
    let from = child.startIndex;
    let to = child.endIndex;
    for (const cut of [typeNode, valueNode]) {
      if (!cut) continue;
      // A PREFIX annotation (C `int a`, Go `a string` is a suffix, Java `String a` a prefix) starts
      // at or before the parameter itself, so the name is what follows it; otherwise it trails and
      // the name is what precedes it.
      if (cut.startIndex <= from) from = Math.max(from, cut.endIndex);
      else to = Math.min(to, cut.startIndex);
    }
    // An early-out, NOT the load-bearing guard: the empty-name check below catches the same case
    // (verified by mutation — removing this alone changes nothing, removing both breaks C's
    // `f(void)`). Kept because it says the intent at the point the span collapses.
    if (to <= from) continue;   // nothing but an annotation: C's `f(void)` — not a parameter

    // Only the separators the cut exposed are trimmed. A trailing `:` that was NOT cut is part of
    // the name — Ruby's keyword parameter `k:` means something different from `k`.
    let name = child.text.slice(from - child.startIndex, to - child.startIndex);
    // `?` is trimmed ONLY when `optional` already records it — a marker carried by a flag would
    // otherwise be stated twice, and `c?` is not what anyone searches for. Ruby's `k:` is the
    // opposite case and keeps its colon, because no flag carries it and `k` means something else.
    if (to < child.endIndex) name = name.replace(optional ? /[\s:=?]+$/ : /[\s:=]+$/, '');
    name = name.trim();
    if (!name) continue;

    out.push({ name, type: declared, optional });
  }
  return out;
}

/**
 * The declared return type of a function/method match, or null when none is written.
 *
 * The capture holds the whole annotation (`": CoreDatabaseManager"`), because the grammar's
 * `return_type` field points at the `type_annotation` node and the colon belongs to it. Strip the
 * colon and the whitespace; keep everything else verbatim, including a generic (`Promise<Foo>`),
 * because a truncated type is a wrong one rather than a shorter one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function returnTypeOf(match: any): string | null {
  const capture = match.captures?.find((c: any) => c.name === 'return_type');
  if (!capture) return null;
  // Leading `:` or `->` stripped: TypeScript and Python write `: Foo`, Go and Java write the bare
  // type, and a grammar that includes the arrow gives `-> Foo`. All three reduce to the name.
  const text = String(capture.node.text).replace(/^\s*(:|->)\s*/, '').trim();
  return text.length > 0 ? text : null;
}
