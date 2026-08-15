import { isBuiltIn, getGlobalId } from '@/lib/core/parsing/built-ins.js';
import { attachDocs, firstLineOf, type HarvestedComment } from '@/lib/core/parsing/doc-comments.js';
import { nextRoutes } from "@/lib/core/parsing/next-routes.js";
import type Parser from "tree-sitter";
import { PrismSpectrum, SpectrumNode } from "../../core/parsing/prism-core.js";
import { ConducksProvider } from "../../core/parsing/providers/base.js";
import { grammars } from "../../core/parsing/grammar-registry.js";
import { ImportProcessor } from "../../core/parsing/processors/import.js";
import { classifyOrigin } from "../../core/graph/boundary-classifier.js";
import { BindingProcessor } from "../../core/parsing/processors/binding.js";
import { CallProcessor } from "../../core/parsing/processors/call.js";
import { HeritageProcessor } from "../../core/parsing/processors/heritage.js";
import { FlowProcessor } from "../../core/parsing/processors/flow.js";
import { AnalyzeContext } from "../../core/parsing/context.js";
import { chronicle } from "../../core/git/chronicle-interface.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "../../core/algorithms/entropy.js";
import { mapToCanonical, CanonicalKind, CanonicalRank } from "../../core/parsing/taxonomy.js";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

import { CaptureTags, DEFINITION_CAPTURES } from "../../../types/capture-tags.js";
import { getProjectRelativePath } from "../../core/utils/path-utils.js";

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
function structuralPath(filePath: string): string {
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
const stripQuotes = (v: string): string => v.replace(/^['"`]|['"`]$/g, '');

/**
 * Turn whatever a grammar calls the HTTP verb into the verb.
 *
 * Each language names its own route construct — Spring's `@GetMapping`, Go's `HandleFunc`, Flask's
 * `@app.route`, Rails' `resources` — but the VERB those imply is not language-specific, so the
 * mapping belongs here rather than in ten query files. Anything unrecognised stays as-is and is
 * uppercased, which keeps an unknown framework matching itself rather than silently becoming GET.
 */
const normalizeHttpMethod = (raw: string | undefined): string => {
  const v = (raw ?? 'GET').replace(/Mapping$|Attribute$/, '').toUpperCase();
  if (v === 'REQUEST' || v === 'ROUTE' || v === 'HANDLEFUNC' || v === 'HANDLE') return 'GET';
  return v;
};

/** The `<scope.>name` a variable's node id is built from — the scope prefix is what makes it unique. */
const scopedVarKey = (scope: string | null | undefined, name: string): string =>
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
function memberTypesOf(bodyNode: any): Record<string, string> {
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
function objectPathsOf(objectNode: any): Record<string, string> {
  const out: Record<string, string> = {};

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
function kindFromCapture(captureName: string, match: any): string {
  const kind = captureName.slice(2).toLowerCase();
  if (kind !== 'variable') return kind;
  const hasParams = match?.captures?.some((c: any) => c.name === 'params' || c.name === 'params_inline');
  return hasParams ? 'function' : kind;
}

function paramsOf(match: any): Array<{ name: string; type: string | null; optional: boolean }> {
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
function returnTypeOf(match: any): string | null {
  const capture = match.captures?.find((c: any) => c.name === 'return_type');
  if (!capture) return null;
  // Leading `:` or `->` stripped: TypeScript and Python write `: Foo`, Go and Java write the bare
  // type, and a grammar that includes the arrow gives `-> Foo`. All three reduce to the name.
  const text = String(capture.node.text).replace(/^\s*(:|->)\s*/, '').trim();
  return text.length > 0 ? text : null;
}

/**
 * A file that could NOT be read structurally. Thrown, never swallowed.
 *
 * Every one of these used to fall back to a regex extractor that produced nodes and almost no edges.
 * That is the worst possible failure mode: the graph stays populated, so nothing looks broken, and
 * the file's symbols simply appear to have no relationships — indistinguishable from code that
 * genuinely has none. A malformed query in THIS repository degraded to regex per file and reported
 * success (ADR 0089).
 *
 * The callers already record a failed file rather than aborting the pulse, so one unreadable file
 * costs that file and is counted, instead of costing the truth about every file like it.
 */
export class ParseFailure extends Error {
  constructor(
    public readonly filePath: string,
    public readonly langId: string,
    public readonly reason: string,
  ) {
    super(`[Conducks] cannot read ${filePath} as ${langId}: ${reason}`);
    this.name = 'ParseFailure';
  }
}

export class ConducksReflector {
  public id = 'structural-reflector';
  public type = 'analyzer' as any;
  public description = 'Analyzes source code units and reflects their structure into a Synapse graph.';
  public readonly imports = new ImportProcessor();
  private bindings = new BindingProcessor();
  private calls = new CallProcessor();
  private heritage = new HeritageProcessor();
  private flow = new FlowProcessor();

  /**
   * Reflects a file's structure into a Spectrum based on a Provider.
   */
  public async reflect(
    file: { path: string, source: string },
    provider: ConducksProvider,
    context: AnalyzeContext,
    allPaths: string[]
  ): Promise<PrismSpectrum> {
    const spectrum: PrismSpectrum = {
      nodes: [],
      relationships: [],
      metadata: { language: provider.langId }
    };

    const isTestFile = (() => {
      const lowerPath = file.path.toLowerCase();
      const fileName = lowerPath.split('/').pop() || '';
      return (
        fileName.startsWith('test_') ||
        fileName.endsWith('_test.go') ||
        fileName.endsWith('_test.rs') ||
        fileName.endsWith('_test.py') ||
        fileName.endsWith('_spec.rb') ||
        fileName.endsWith('tests.swift') ||
        fileName.endsWith('.test.ts') ||
        fileName.endsWith('.test.js') ||
        fileName.endsWith('.spec.ts') ||
        fileName.endsWith('.spec.js') ||
        /^test/.test(fileName) ||
        lowerPath.includes('/tests/') ||
        lowerPath.includes('/__tests__/') ||
        lowerPath.includes('/spec/') ||
        lowerPath.includes('/test/')
      );
    })();

    const fileMeta = mapToCanonical('file');
    const canonicalPath = file.path.toLowerCase();
    const projectRoot = chronicle.getProjectDir()?.toLowerCase() || '';
    const relativePath = path.relative(projectRoot, file.path).toLowerCase();

    // Namespace calculation
    const rootName = path.basename(projectRoot).toLowerCase();
    const namespacePath = path.dirname(relativePath);
    const namespaceId = namespacePath === '.' ? `repository::${rootName}` : `directory::${path.join(projectRoot, namespacePath).toLowerCase()}`;

    const fileId = `${canonicalPath}::unit`;
    // A file's span runs from line 1 to its last line, so UNIT nodes carry a
    // real range for "% of file activated by coverage" instead of lineEnd=0.
    const fileLineCount = file.source.split('\n').length;
    const unitNode: SpectrumNode = {
      name: path.basename(file.path),
      kind: 'file' as any,
      canonicalKind: fileMeta.kind,
      canonicalRank: fileMeta.rank,
      range: { start: { line: 1, column: 0 }, end: { line: fileLineCount, column: 0 } },
      filePath: file.path,
      isExport: true,
      properties: {
        // persistence.ts derives lineStart/lineEnd from node.properties.range,
        // not the top-level `range` field — mirror it here or UNIT rows persist lineEnd=0.
        range: { start: { line: 1, column: 0 }, end: { line: fileLineCount, column: 0 } }
      },
      metadata: {
        id: fileId,
        isGlobalNode: true,
        isTest: isTestFile,
        displayName: path.basename(file.path),
        canonicalRank: fileMeta.rank,
        canonicalKind: 'UNIT',
        // A unit does not belong to another unit — it IS one. `unitId` answers "which file
        // contains this node", and a file does not contain itself. persistence.ts:531 already
        // documents this rule ("a unit's own row has unitId = NULL... it belongs to none") and
        // purgeUnits relies on it. Setting this to `fileId` was the same shape of bug ADR 0056
        // fixed for `parentId` — a self-loop from a generic fallback, not a deliberate choice
        // (todo26 Phase 0).
        unitId: null,
        namespaceId: namespaceId,
        rootId: `repository::${rootName}`,
        layer_path: relativePath,
        depth: 3
      }
    } as any;

    const parser = grammars.getUnifiedParser(provider.langId);

    if (!parser) {
      throw new ParseFailure(file.path, provider.langId, 'no parser is registered for this language');
    }

    const lang = grammars.getLanguage(provider.langId);
    if (!lang) throw new Error(`[Conducks] Missing native grammar: ${provider.langId}`);

    let tree: any;
    try {
      // tree-sitter's Node binding defaults to a 32KB parse buffer and throws
      // "Invalid argument" on larger inputs. Size the buffer to the source so
      // big files parse natively instead of falling back to the edge-less
      // Gnosis extractor (which would make their symbols look orphaned).
      const byteLen = Buffer.byteLength(file.source, 'utf8');
      const bufferSize = byteLen > 31 * 1024 ? byteLen * 2 + 1024 : undefined;
      tree = bufferSize ? parser.parse(file.source, undefined, { bufferSize }) : parser.parse(file.source);
    } catch (err) {
      throw new ParseFailure(file.path, provider.langId, `the grammar could not parse this file: ${String((err as Error)?.message ?? err)}`);
    }

    let query: any;
    try {
      const lang = grammars.getLanguage(provider.langId);
      if (!lang) throw new ParseFailure(file.path, provider.langId, 'the grammar is not loaded');
      query = grammars.createQuery(lang, provider.queryScm);
    } catch (err) {
      // A MALFORMED QUERY, which is a defect in this repository rather than in the file being read.
      // It used to degrade to regex per file, so a broken query looked like sparse code.
      throw new ParseFailure(file.path, provider.langId, `the language query is invalid: ${String((err as Error)?.message ?? err)}`);
    }

    if (!query) throw new ParseFailure(file.path, provider.langId, 'the language query compiled to nothing');

    let matches = [];
    try {
      matches = query.matches(tree.rootNode);
    } catch (err) {
      throw new ParseFailure(file.path, provider.langId, `the query crashed against this file's tree: ${String((err as Error)?.message ?? err)}`);
    }
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.log(`🛡️ [Reflector] ${path.basename(file.path)} matches: ${matches.length}`);
    }

    const nodeCache = new Map<string, SpectrumNode>();
    // Every comment in this file, joined to declarations after the walk (ADR 0133).
    const docComments: HarvestedComment[] = [];
    /** Lines holding OVERLOAD SIGNATURES, per symbol name — the doc join anchors at the first. */
    const overloadLines = new Map<string, number[]>();

    nodeCache.set(fileId, unitNode);

    context.clearLocalBindings();

    // === Pass 1: Build Scope Map ===
    // Columns are carried, not just rows: a one-line declaration
    // (`export class Widget { run(): void {} }`) gives the class and its method IDENTICAL start and
    // end rows, so a row-only ordering cannot tell container from member and the scope chain can
    // invert — producing `run.widget` instead of `widget.run`. That corrupts the node ID, and every
    // id-keyed consumer with it: the import edge pointed at `::widget` while the node was stored as
    // `::run.widget`, so prune could never resolve it and silently never reported the unused import.
    type ScopeEntry = { name: string; startRow: number; startCol: number; endRow: number; endCol: number };
    const scopeMap: ScopeEntry[] = [];

    for (const match of matches) {
      const isScoped = match.captures.some((c: any) =>
        c.name === CaptureTags.IS_FUNCTION ||
        c.name === CaptureTags.IS_CLASS ||
        c.name === CaptureTags.IS_STRUCT ||
        c.name === CaptureTags.IS_METHOD ||
        c.name === CaptureTags.IS_INTERFACE ||
        c.name === CaptureTags.IS_INFRA ||
        c.name === CaptureTags.IS_ENUM
      );
      if (isScoped) {
        const nameCap = match.captures.find((c: any) => c.name === CaptureTags.NAME);
        if (nameCap && nameCap.node) {
          const name = nameCap.node.text;
          const rangeNode = nameCap.node.parent || nameCap.node;
          scopeMap.push({
            name,
            startRow: rangeNode.startPosition.row,
            startCol: rangeNode.startPosition.column,
            endRow: rangeNode.endPosition.row,
            endCol: rangeNode.endPosition.column
          });
        }
      }
    }

    /** True when position (aRow,aCol) is at or before (bRow,bCol). */
    const atOrBefore = (aRow: number, aCol: number, bRow: number, bCol: number): boolean =>
      aRow < bRow || (aRow === bRow && aCol <= bCol);

    /**
     * `self` is the span of the declaration whose parent is being resolved. Any scope that sits
     * INSIDE it is a member, not a container, and must not become its parent.
     *
     * Excluding by name alone was not enough. On `export class Widget { run(): void {} }` the class
     * and its method share one row, so `run` passed the row test while resolving `Widget`'s parent
     * and the chain came out `run.widget` — the class parented by its own method. Multi-line code
     * hid it: there, the class's start row falls outside the method's range and it is filtered
     * naturally.
     */
    const getScopeAt = (
      row: number,
      excludeName?: string,
      self?: { startRow: number; startCol: number; endRow: number; endCol: number }
    ): string => {
      // Find all scopes that organically encapsulate the row
      const enclosing = scopeMap.filter(s => {
        if (excludeName && s.name === excludeName) return false;
        if (row < s.startRow || row > s.endRow) return false;
        if (self && atOrBefore(self.startRow, self.startCol, s.startRow, s.startCol)
                 && atOrBefore(s.endRow, s.endCol, self.endRow, self.endCol)) {
          return false;   // s is contained by the declaration being resolved
        }
        // A scope encloses this declaration only if it actually CONTAINS it. The row test above is
        // not enough when two declarations share a line: `struct User {} fn main() {}` puts both on
        // row 0, each passes the other's row check, and the guard above only rejects a scope the
        // declaration contains — never one it merely sits beside. Both `user.main` and `main.user`
        // were created, each naming the other as parent, and neither `user` nor `main` survived as
        // a standalone node because both were consumed as children. That is all four of the
        // dangling `parentId` values on this repository (todo25), and the reproduction is one line
        // of Rust or C.
        if (self && !(atOrBefore(s.startRow, s.startCol, self.startRow, self.startCol)
                   && atOrBefore(self.endRow, self.endCol, s.endRow, s.endCol))) {
          return false;
        }
        return true;
      });

      // Sort by absolute encapsulation (largest container first). Columns break the tie when two
      // scopes share a row — without them a one-line class and its method are indistinguishable and
      // the chain can come out reversed.
      enclosing.sort((a, b) => {
        if (a.startRow !== b.startRow) return a.startRow - b.startRow;
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        if (a.endRow !== b.endRow) return b.endRow - a.endRow;
        return b.endCol - a.endCol;
      });

      const names: string[] = [];
      for (const s of enclosing) {
        if (!names.includes(s.name)) names.push(s.name);
      }

      return names.join('.');
    };

    // === Pass 2: Semantic Pulse ===
    // Reference-as-value candidates: bare identifiers passed as call arguments (callbacks, DI-table
    // values). Collected here, resolved AFTER the match loop — tree-sitter match order is NOT source
    // order, so gating on nodeCache mid-loop would miss a use that precedes its definition.
    /** `const x = new Y()` pairs, collected during the walk and attached to nodes after it. */
    const instanceTypes = new Map<string, string>();
    // The DECLARATION line of each typed variable, kept beside the type because the instance-type
    // edges are emitted after the capture loop and the row is gone by then (ADR 0099).
    const instanceTypeLines = new Map<string, number>();
    let pendingInstance: string | null = null;
    /** `const x = Y.factory()` pairs — the CALL, resolved to a type later by IntraLinker. */
    const instanceCalls = new Map<string, string>();
    let pendingInstanceCall: string | null = null;
    /** Object-literal wiring: variable name -> { property path: identifier it aliases }. */
    const objectPaths = new Map<string, Record<string, string>>();
    let pendingObject: string | null = null;
    /** Interface name -> { member: declared type }. */
    const memberTypes = new Map<string, Record<string, string>>();
    let pendingIface: string | null = null;

    const refValueCandidates: Array<{ scope: string; name: string; raw: string; line: number }> = [];
    for (const match of matches) {
      if (!match || !match.captures || match.captures.length === 0) continue;

      const firstCapture = match.captures[0];
      if (!firstCapture || !firstCapture.node) continue;

      const currentMatchRow = firstCapture.node.startPosition.row;
      const matchNameCap = match.captures.find((c: any) => c.name === CaptureTags.NAME || c.name === 'pulse_assignment_name');

      let node: any;
      if (matchNameCap && matchNameCap.node) {
        const name = matchNameCap.node.text;
        // The declaration's own span, so a scope it CONTAINS cannot be mistaken for its parent.
        // This has to be known HERE, not just where parentId is built below: the scope chain is what
        // the node ID is made of, and an inverted chain (`run.widget`) is a wrong identity, not just
        // a wrong parent pointer — the import edge then points at an id no node has.
        const declIsScoped = match.captures.some((c: any) =>
          c.name === CaptureTags.IS_FUNCTION || c.name === CaptureTags.IS_CLASS ||
          c.name === CaptureTags.IS_STRUCT || c.name === CaptureTags.IS_METHOD ||
          c.name === CaptureTags.IS_INTERFACE || c.name === CaptureTags.IS_ENUM ||
          c.name === CaptureTags.IS_INFRA);
        const declRange = (declIsScoped && matchNameCap.node.parent) ? matchNameCap.node.parent : matchNameCap.node;
        const declSpan = {
          startRow: declRange.startPosition.row,
          startCol: declRange.startPosition.column,
          endRow: declRange.endPosition.row,
          endCol: declRange.endPosition.column,
        };
        const scope = getScopeAt(currentMatchRow, name, declSpan);
        const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
        const scopedId = `${file.path.toLowerCase()}::${scopePrefix}${name.toLowerCase()}`;
        

        const isDefinition = match.captures.some((c: any) => DEFINITION_CAPTURES.has(c.name));

        if (isDefinition) {
          if (context.isDiscoveryMode()) {
            context.registerGlobalSymbol(scopedId, { name, kind: 'unknown', filePath: file.path });
          }

          // TWO SYMBOLS, ONE ID: `interface MergeImpact` and `function mergeImpact` both lowercase
          // to `merge-impact.ts::mergeimpact`. Ids are lowercased for APFS (CONDUCKS-4), and
          // TypeScript separates its type and value namespaces BY CASE, so this is ordinary code —
          // a type beside its factory, a class beside its singleton. Six files on this repository.
          //
          // First-declared used to win outright and the second produced no node at all. The
          // interface is usually declared first, so the surviving node carried the INTERFACE's span
          // while every call the FUNCTION makes was attributed to it — `trace`, `explain` and
          // `coverage` then showed a reader a block of type declarations that calls nothing.
          //
          // The VALUE wins the id, because edges target values and a value has a body to point at.
          // This does not give the type its own node — that needs an id change and 39% of ids carry
          // uppercase, so it is a separate decision (todo32). It makes the surviving node point at
          // REAL CODE, which is the damage that was measured.
          const existing = nodeCache.get(scopedId) as any;
          const ERASED_AT_RUNTIME = new Set(['interface', 'type', 'typealias']);
          const defKindNow = (match.captures.find((c: any) => DEFINITION_CAPTURES.has(c.name))?.name ?? '').slice(2).toLowerCase();
          const valueOverType = !!existing
            && ERASED_AT_RUNTIME.has(String(existing.metadata?.kind ?? existing.kind ?? '').toLowerCase())
            && !ERASED_AT_RUNTIME.has(defKindNow);

          if (!nodeCache.has(scopedId) || valueOverType) {
            const defCapture = match.captures.find((c: any) => DEFINITION_CAPTURES.has(c.name));
            let initialKind = defCapture ? kindFromCapture(defCapture.name, match) : 'variable';

            // NOTE: a name-suffix infra override used to sit here — deleted 2026-07-25 as provably
            // dead: a node-creating match always carries a definition capture, whose kind assignment
            // (the DEFINITION_CAPTURES-gated branch below) overwrites initialKind unconditionally.
            // NOTE: this used to point at a twin heuristic in the Gnosis regex fallback. That
            // fallback is gone (ADR 0089) — a file that cannot be parsed now fails and is reported
            // instead of degrading to regex — so this branch is the only one of its kind left.
            // IS_INFRA included so multi-line infra (decorators, providers) get a real span.
            // Note: single-line @isInfra hook patterns (useState/useEffect array_pattern) still
            // collapse to ~1 line — resolving those needs a variable_declarator walk (deferred, low value).
            const isScoped = match.captures.some((c: any) => c.name === CaptureTags.IS_FUNCTION || c.name === CaptureTags.IS_CLASS || c.name === CaptureTags.IS_STRUCT || c.name === CaptureTags.IS_METHOD || c.name === CaptureTags.IS_INTERFACE || c.name === CaptureTags.IS_ENUM || c.name === CaptureTags.IS_INFRA);
            let rangeNode = matchNameCap.node;
            if (isScoped && matchNameCap.node.parent) {
              rangeNode = matchNameCap.node.parent;
            }

            const canonical = mapToCanonical(initialKind);
            const parentScopeName = getScopeAt(currentMatchRow, name, declSpan);
            const parentScopePrefix = parentScopeName ? `${parentScopeName.toLowerCase()}.` : '';
            const parentId = parentScopeName
              ? `${file.path.toLowerCase()}::${parentScopePrefix.toLowerCase()}`.slice(0, -1)
              : fileId;

            const dna = {
              isAsync: match.captures.some((c: any) => c.name === CaptureTags.IS_ASYNC),
              isAbstract: match.captures.some((c: any) => c.name === CaptureTags.IS_ABSTRACT),
              isExported: match.captures.some((c: any) => c.name === CaptureTags.IS_EXPORTED),
              isStatic: match.captures.some((c: any) => c.name === CaptureTags.IS_STATIC),
              params: paramsOf(match),
              // The DECLARED return type, or null when the source does not state one.
              //
              // This was the literal `'void'` for every function in every language — 4,267 nodes on
              // the subject-b vault all claiming to return void, none of them measured, and
              // `query-service.ts` reports it to users as if it were a fact. `null` is the honest
              // value for "not declared": an absent annotation is not a claim of void, and treating
              // the two as one is what made `getInstance(): CoreDatabaseManager` unreadable.
              returns: returnTypeOf(match) };

            const fingerprint = crypto.createHash('sha256').update(`${structuralPath(file.path)}|${name}|${JSON.stringify(dna)}`).digest('hex');

            nodeCache.set(scopedId, {
              name,
              kind: initialKind as any,
              canonicalKind: canonical.kind,
              canonicalRank: canonical.rank,
              range: {
                start: { line: rangeNode.startPosition.row + 1, column: rangeNode.startPosition.column },
                end: { line: rangeNode.endPosition.row + 1, column: rangeNode.endPosition.column }
              },
              label: (canonical as any).kind,
              isShallow: false,
              properties: {
                filePath: file.path,
                name: name,
                range: {
                  start: { line: rangeNode.startPosition.row + 1, column: rangeNode.startPosition.column },
                  end: { line: rangeNode.endPosition.row + 1, column: rangeNode.endPosition.column }
                },
                isExport: false,
                canonicalKind: canonical.kind,
                canonicalRank: canonical.rank,
                parentId,
                unitId: fileId,
                namespaceId: unitNode.metadata.namespaceId,
                rootId: unitNode.metadata.rootId,
                structureId: parentScopeName ? parentId : null,
                layer_path: `${unitNode.metadata.layer_path}/${name.toLowerCase()}`,
                depth: canonical.rank,
                fingerprint,
                dna,
                signature: { returnTypes: [], throwsTypes: [], sideEffects: [] },
                kinetic: {}
              },
              filePath: file.path,
              isExport: false,
              metadata: {
                id: scopedId,
                isTest: isTestFile,
                isExport: false,
                canonicalKind: canonical.kind,
                canonicalRank: canonical.rank,
                parentId,
                unitId: fileId,
                namespaceId: unitNode.metadata.namespaceId,
                rootId: unitNode.metadata.rootId,
                structureId: parentScopeName ? parentId : null,
                layer_path: `${unitNode.metadata.layer_path}/${name.toLowerCase()}`,
                depth: canonical.rank,
                fingerprint,
                dna,
                signature: { returnTypes: [], throwsTypes: [], sideEffects: [] },
                kinetic: {}
              }
            } as any);
          }
        }
        node = nodeCache.get(scopedId);
      }

      if (context.isDiscoveryMode()) continue;

      if (node && match.captures.some((c: any) => c.name === CaptureTags.IS_EXPORTED)) {
        node.isExport = true;
        node.metadata.isExport = true;
      }

      const captureMap: Record<string, string> = {};
      const args: string[] = [];

      match.captures.forEach((c: any) => {
        if (c.node) captureMap[c.name] = c.node.text;
        if (c.name === 'kinesis_arg' && c.node) args.push(c.node.text);
      });

      for (const capture of match.captures) {
        const cName = capture.name;
        const cText = capture.node.text;

        if (cName.startsWith('is')) {
          const kind = kindFromCapture(cName, match);

          if (kind === 'import') {
            const sourceCap = match.captures.find((c: any) => c.name === CaptureTags.SOURCE);
            if (sourceCap && sourceCap.node) {
              const specifier = sourceCap.node.text.replace(/^['"]|['"]$/g, '');

              // System 2 (ADR 0012): classify the boundary origin at capture. Edge properties now
              // persist, so this rides through to the vault — internal/stdlib/dependency + package.
              // The workspace map makes a sibling package read as internal rather than as a
              // third-party dependency — without it a monorepo reports its own modules as its
              // supply-chain surface (ADR 0108).
              const boundary = classifyOrigin(
                specifier,
                undefined,
                new Set((context?.getWorkspacePackages?.() ?? []).map(([n]) => n)),
              );

              // Seed the Spectrum with the RAW SPECIFIER for later resolution 🏺
              spectrum.relationships.push({
                sourceName: 'unit',
                targetName: specifier,
                type: 'IMPORTS' as any,
                confidence: 1.0,
                metadata: { specifier, isRaw: true, origin: boundary.origin, package: boundary.package, line: currentMatchRow + 1 }
              });

              // A NAMED IMPORT THAT IS A MODULE imports that module's FILE, and only the file's
              // import scope makes its members reachable. `from foundation import paths` binds the
              // module `foundation/paths.py`, and until this existed the unit's import scope held
              // only the package `__init__.py` — so every `paths.resolve_project_path(...)` call
              // dangled, and `impact` answered 0 callers for a function with 10 measured call sites
              // (todo44#P6, the vs-grep benchmark's headline finding). The `@named_import` capture
              // carried exactly this information and was consumed NOWHERE.
              //
              // Gated on namespace import semantics (Python's), and on `<spec>.<name>` resolving to
              // a real in-repo file — a named SYMBOL import (`from foundation import JobRunner`)
              // resolves to no file and changes nothing.
              if (provider.importSemantics === 'namespace') {
                for (const cap of match.captures) {
                  if (cap.name !== 'named_import' || !cap.node) continue;
                  const subSpec = `${specifier}.${cap.node.text}`;
                  const subModule = this.imports.resolve(subSpec, file.path, allPaths, provider, context);
                  if (typeof subModule !== 'string') continue;
                  spectrum.relationships.push({
                    sourceName: 'unit',
                    targetName: subSpec,
                    type: 'IMPORTS' as any,
                    confidence: 1.0,
                    metadata: { specifier: subSpec, isRaw: true, origin: 'internal', package: null, line: currentMatchRow + 1 }
                  });
                }
              }

              for (let i = 0; i < match.captures.length; i++) {
                const cap = match.captures[i];
                // `@named_import` IS a binding capture (todo48#P3). Python spells it that way and
                // this loop only accepted `@name`, so Python produced NO per-binding IMPORTS edges
                // at all — which costs two things, not one: function-level dead-code detection for
                // imports, and type-only marking (ADR 0016), whose only real second case is
                // Python's `if TYPE_CHECKING:` block. That block exists precisely so a name can be
                // annotated without existing at runtime, and it is the standard fix for a Python
                // import cycle — exactly the finding an unmarked edge pollutes.
                //
                // The submodule branch above reads the same capture for a different question
                // (`from pkg import module` binding a FILE) and pushes its own `isRaw` edge; this
                // pushes an `isRawBinding` one. Different metadata, different consumers, no
                // double-count — `markTypeOnlyImports` and dead-code both filter on isRawBinding.
                const isBindingCapture = cap.name === CaptureTags.NAME || cap.name === 'named_import';
                if (isBindingCapture && cap.node) {
                  // An alias is `@alias` in most grammars and `@metadata` in Python's
                  // `(aliased_import (dotted_name) @named_import (identifier) @metadata)`. Reading
                  // only the capture that FOLLOWS a binding keeps a wildcard's bare `@metadata`
                  // out of it, since that one has no binding capture before it.
                  const nextCap = i + 1 < match.captures.length ? match.captures[i + 1] : undefined;
                  const aliasCap = nextCap && (nextCap.name === 'alias' || (cap.name === 'named_import' && nextCap.name === 'metadata'))
                    ? nextCap : undefined;
                  const bindingName = cap.node.text;
                  const aliasName = (aliasCap && aliasCap.node) ? aliasCap.node.text : bindingName;

                  if (context) {
                    // Register the RESOLVED path, not the raw specifier. `CallProcessor` builds a
                    // target id as `${binding}::${name}`, so storing the specifier produced ids
                    // like `@/registry/index.js::registry.audit.advise` — 817 dangling edges here,
                    // the single largest group, because an alias is not a path any node is keyed
                    // by. Relative specifiers were already fine; aliases and bare packages were
                    // not. Falls back to the specifier when resolution finds nothing, which keeps
                    // the previous behaviour for genuinely external modules.
                    const resolvedSpecifier = this.imports.resolve(specifier, file.path, allPaths, provider, context);
                    context.registerLocalBinding(aliasName, resolvedSpecifier || specifier, bindingName);
                  }

                  // Per-binding IMPORTS relationship for function-level dead code detection
                  spectrum.relationships.push({
                    sourceName: 'unit',
                    targetName: specifier,
                    type: 'IMPORTS' as any,
                    confidence: 0.9,
                    metadata: { specifier, bindingName: bindingName.toLowerCase(), bindingNameRaw: bindingName, isRawBinding: true, origin: boundary.origin, package: boundary.package, line: currentMatchRow + 1 }
                  });
                }
              }
            }
          }

          if (node) {
            node.metadata[cName] = true;
          }

          // ONLY definition captures may set `kind`. Modifier captures (@isAsync, @isExported,
          // @isStatic, @isAbstract) have dedicated handling (dna at creation, isExport below) and
          // flow markers (@isPulse, @isKinetic, @isGuard, @isFlow, @isContract, @isConcurrent,
          // @isDeferred, @isVariadic) carry no kind at all. Ungated, any of them overwrote the
          // node's real kind — a public class became kind 'exported', which mapToCanonical falls
          // through to ATOM, demoting the class so prune could delete it. Pattern ordering cannot
          // fix this: query.matches() is NOT ordered by pattern index. See todo13.
          if (node && DEFINITION_CAPTURES.has(cName as any)) {
            node.kind = kind as any;

            const canonical = mapToCanonical(kind);
            node.canonicalKind = canonical.kind;
            node.canonicalRank = canonical.rank;
            node.metadata.canonicalKind = canonical.kind;
            node.metadata.canonicalRank = canonical.rank;
            node.metadata.displayName = node.name;

            const scope = getScopeAt(currentMatchRow, node.name);
            const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
            const scopedId = `${file.path.toLowerCase()}::${scopePrefix}${node.name.toLowerCase()}`;
            const registryEntry = context.getGlobalSymbol(scopedId);
            if (registryEntry) registryEntry.kind = kind;

            // A BARREL RE-EXPORT points at the thing it re-exports.
            //
            // `export { assembleGitClone } from './git-clone'` mints a node in the barrel and, until
            // now, nothing else — an ISLAND whose only edge was MEMBER_OF to its own file. So the
            // real declaration showed only the consumers importing it directly, and everyone
            // reaching it through the barrel was invisible from the declaration. Answering "who uses
            // this" meant querying every node in the re-export chain by hand, which is exactly the
            // work the graph exists to remove (ADR 0109).
            //
            // The RENAMED form already did this via the `alias` branch below; the un-renamed form
            // (`export_specifier name: @name !alias`) has no `@alias` capture, so it never reached
            // it. Same fact, written differently — the gap was in the query shape, not the idea.
            if (kind === 'binding' && !match.captures.some((c: any) => c.name === 'alias')) {
              const src = match.captures.find((c: any) => c.name === CaptureTags.SOURCE)?.node?.text;
              const spec = src ? src.replace(/^['"]|['"]$/g, '') : null;
              const target = spec ? this.imports.resolve(spec, file.path, allPaths, provider, context) : null;
              if (typeof target === 'string') {
                // SCOPED, matching `scopedId` above — the alias edge must name the node this match
                // is minting, and that node's id carries its enclosing scope. Passing the bare name
                // built `<file>::doit` for a node stored as `<file>::main2.doit`, so the edge
                // referenced nothing: the ATOM edge-gate then saw an unreferenced binding and pruned
                // it, and prune's own cleanup did not match the edge either, leaving a confident
                // edge pointing at a node that no longer existed (todo62). A module-level re-export
                // has no scope, so this is the identity there — which is why the 57 healthy alias
                // edges never showed the bug.
                this.bindings.processAlias(`${scopePrefix}${node.name}`, `${target.toLowerCase()}::${node.name.toLowerCase()}`, spectrum, currentMatchRow + 1);
              }
            }

            if (provider.calculateComplexity && (kind === 'function' || kind === 'method' || kind === 'class')) {
              const comp = provider.calculateComplexity(capture.node);
              node.metadata.complexity = comp;
              (node as any).complexity = comp;
            }
          }
        }
        else if (cName === 'overload_name') {
          // An overload SIGNATURE has no body and mints no node — only its LINE is recorded, so the
          // doc join can anchor at the first signature instead of the implementation. Measured on
          // orchestrator's registry.ts: the doc sat above overload :43, the node was minted at the
          // implementation :45, and a two-line window could not bridge them.
          const key = cText.toLowerCase();
          if (!overloadLines.has(key)) overloadLines.set(key, []);
          overloadLines.get(key)!.push(capture.node.startPosition.row + 1);
        }
        else if (cName === 'typeof_target' && node) {
          // `type Registry = typeof registry` — the TYPE is the shape of the VARIABLE, stated in
          // the source (todo42#P2). Recorded on the type node so the linker can follow a parameter
          // typed `Registry` through to the variable's object paths (ADR 0094) instead of stopping
          // at a type node that owns nothing.
          node.metadata.typeofTarget = cText.toLowerCase();
        }
        else if ((cName === 'heritage' || cName === 'heritage_extends' || cName === 'heritage_implements') && node) {
          // The clause keyword IS the relation type. Queries whose grammar separates the two
          // clauses (typescript, tsx) capture @heritage_extends / @heritage_implements, so the
          // decision is made HERE, not guessed from the target's name. Plain @heritage keeps the
          // processor's name heuristic as a fallback for the languages not yet split.
          const explicit = cName === 'heritage_extends' ? 'EXTENDS'
            : cName === 'heritage_implements' ? 'IMPLEMENTS'
            : undefined;
          this.heritage.process(cText, node.name, spectrum, explicit, currentMatchRow + 1);
        }
        else if (cName === 'alias' && node) {
          // QUALIFY the target where the match names its source module. A bare original name relies
          // on IntraLinker scoping the lookup to files this unit imports, and a DYNAMIC import
          // (`const { POST: x } = await import('...')`) produces no such import scope — so those
          // aliases dangled on a bare `post`/`get`. The specifier is right there in the match, so
          // resolve it and point at the real file (ADR 0085).
          const aliasSource = match.captures.find((c: any) => c.name === CaptureTags.SOURCE)?.node?.text;
          const specifier = aliasSource ? aliasSource.replace(/^['"]|['"]$/g, '') : null;
          const resolved = specifier ? this.imports.resolve(specifier, file.path, allPaths, provider, context) : null;
          // An external dependency resolves to a descriptor, not a path — leave those bare, since
          // there is no project file to qualify against.
          const resolvedPath = typeof resolved === 'string' ? resolved.toLowerCase() : null;
          // SCOPED for the same reason as the un-renamed branch above (todo62): the node minted for
          // this binding carries its enclosing scope in its id, so an alias edge built from the bare
          // name points at an id nothing stores. `const { helper: doIt } = await import(...)` inside
          // `main2` stores `<file>::main2.doit` and used to emit the edge from `<file>::doit`.
          const aliasScope = getScopeAt(currentMatchRow, node.name);
          const aliasSourceName = aliasScope ? `${aliasScope}.${node.name}` : node.name;
          this.bindings.processAlias(aliasSourceName, resolvedPath ? `${resolvedPath}::${cText.toLowerCase()}` : cText, spectrum, currentMatchRow + 1);

          // Register the binding as well, so a CALL through the local name lands on the original.
          // The import branch above does this for `import { A as B }`; a DESTRUCTURED DYNAMIC import
          // never reaches that branch, so `await sendMessage(...)` was emitted as a bare local name —
          // free to be bound by IntraLinker to any imported unit owning that name, which is the
          // measured wrong edge in ADR 0085.
          if (resolvedPath && context) context.registerLocalBinding(node.name, resolvedPath, cText);
        }
        else if (cName === 'kinesis_target' || cName === 'kinesis_qualified_target') {
          const scope = getScopeAt(currentMatchRow);

          let finalTarget = cText;
          if (captureMap['kinesis_object']) {
            finalTarget = `${captureMap['kinesis_object']}.${cText}`;
          }

          const type = this.calls.isConstructor(finalTarget, provider) ? 'CONSTRUCTS' : 'CALLS';
          // `currentMatchRow` is 0-based (tree-sitter); every line the vault stores is 1-based.
          this.calls.process(finalTarget, scope, type, spectrum, args, context, currentMatchRow + 1);

          // Reference-as-value: a bare identifier passed as a call ARGUMENT (a callback like
          // `addEventListener('load', initUI)`, or a function handed to a DI/command table) is a
          // USE of that symbol, not a call — the call processor only records the callee. Collect the
          // identifier args now; emit ACCESSES edges after the loop when nodeCache is complete.
          for (const rawArg of args) {
            const a = rawArg.trim();
            if (!/^[A-Za-z_$][\w$]*$/.test(a)) continue; // identifiers only (rejects strings/nums/exprs)
            refValueCandidates.push({ scope: (scope || 'unit').toLowerCase(), name: a.toLowerCase(), raw: a, line: currentMatchRow + 1 });
          }
        }
        else if (cName === 'instance_call_name') {
          // `const db = CoreDatabaseManager.getInstance()` — remember WHICH CALL produced the value.
          //
          // The type is not knowable here: it is the callee's declared return type, and the callee
          // usually lives in another file that this wave may not have parsed yet. So record the call
          // and let IntraLinker read the answer once the whole graph exists. Still a READ — the
          // return type is written on the method — and it resolves to nothing when it is not.
          pendingInstanceCall = scopedVarKey(getScopeAt(currentMatchRow), cText);
        }
        else if (cName === 'instance_call_target') {
          if (pendingInstanceCall) {
            instanceCalls.set(pendingInstanceCall, cText.trim().toLowerCase());
            pendingInstanceCall = null;
          }
        }
        else if (cName === 'augments_name') {
          // An augmentation REFERENCES the type it extends, in the module it names. Both are written
          // in the source, so this is a read (todo33). Resolved here because the specifier is in the
          // match; an unresolvable one records nothing rather than a bare guess.
          const srcCap = match.captures.find((c: any) => c.name === 'augments_source')?.node?.text;
          const spec = srcCap ? srcCap.replace(/^['"]|['"]$/g, '') : null;
          const resolved = spec ? this.imports.resolve(spec, file.path, allPaths, provider, context) : null;
          // AN UNRESOLVED SPECIFIER STILL PROVES THE AUGMENTATION. Only the edge's TARGET was ever in
          // doubt; that this file MERGES INTO something rather than declaring it is written in the
          // syntax. Dropping the whole relationship when the module could not be resolved meant the
          // merged interface read as a fresh declaration nothing references — reported ORPHAN, the
          // strongest wording prune has.
          //
          // MEASURED on the monorepo subject: `@/core/*` maps to `../packages/core/*`, outside the
          // workspace being analysed, so `ServiceTypeMap` was reported dead in BOTH files that
          // augment it. `declare module 'express'` fails the same way and is ordinary code.
          //
          // The unresolved target is recorded as `external://<specifier>`, which is what conducks
          // already calls a thing outside the project, so the id stays honest about what is known:
          // the module named in the source, not a guess at a file.
          const target = typeof resolved === 'string'
            ? resolved.toLowerCase()
            : (spec ? `external://${spec.toLowerCase()}` : null);
          if (target) {
            spectrum.relationships.push({
              sourceName: 'unit',
              targetName: `${target}::${cText.toLowerCase()}`,
              type: 'TYPE_REFERENCE' as any,
              confidence: 1.0,
              metadata: { isAugmentation: true, original: cText, line: currentMatchRow + 1 },
            });
          }
        }
        else if (cName === 'iface_name') {
          pendingIface = cText.trim().toLowerCase();
        }
        else if (cName === 'iface_body') {
          if (pendingIface) {
            const members = memberTypesOf(capture.node);
            if (Object.keys(members).length > 0) memberTypes.set(pendingIface, members);
            pendingIface = null;
          }
        }
        else if (cName === 'object_name') {
          pendingObject = scopedVarKey(getScopeAt(currentMatchRow), cText);
        }
        else if (cName === 'object_value') {
          if (pendingObject) {
            const paths = objectPathsOf(capture.node);
            if (Object.keys(paths).length > 0) objectPaths.set(pendingObject, paths);
            pendingObject = null;
          }
        }
        else if (cName === 'instance_name') {
          // `const x = new Y()` — remember that x IS a Y (todo29#P3b).
          //
          // A CONSTRUCTS edge already exists for the `new Y()`, but its SOURCE is the enclosing
          // SCOPE, so at module level it says "this file constructs a ServiceRegistry" and not
          // "Registry is one". Without the variable-to-type link a later `registry.get(...)` has no
          // way to reach `ServiceRegistry.get` — 192 of subject-b's dangling edges.
          //
          // Reads a DECLARATION rather than inferring: the type is written literally on the same
          // line. A factory (`X.getInstance()`) is deliberately not captured, because its return
          // type is NOT stated here and assuming it is the guess ADR 0070 refuses.
          // Keyed by SCOPE + name, the way the node id is. Without the scope a local
          // `const client = new SmtpClient()` inside a function overwrote the module-level
          // `const client = new HttpClient()`, and every `client.x()` at module scope then resolved
          // to the WRONG class — a confidently wrong edge, which is worse than the dangling one it
          // replaced. Found by testing shadowing rather than by a failure.
          pendingInstance = scopedVarKey(getScopeAt(currentMatchRow), cText);
        }
        else if (cName === 'instance_type') {
          if (pendingInstance) {
            instanceTypes.set(pendingInstance, cText.trim().split('.').pop()!.toLowerCase());
            instanceTypeLines.set(pendingInstance, currentMatchRow + 1);
            pendingInstance = null;
          }
        }
        else if (cName === 'ref_value') {
          // Object-literal value `{ key: someSymbol }` — a reference-as-value (DI table / command
          // map). Same handling as an identifier call-arg: collect now, emit + gate after the loop.
          const a = cText.trim();
          if (/^[A-Za-z_$][\w$]*$/.test(a)) {
            const scope = getScopeAt(currentMatchRow);
            refValueCandidates.push({ scope: (scope || 'unit').toLowerCase(), name: a.toLowerCase(), raw: a, line: currentMatchRow + 1 });
          }
        }
        else if (cName === 'pulse_assignment_name') {
          const val = captureMap['pulse_assignment_value'] ?? 'unknown';
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processAssignment(cText, val, scopeName, spectrum, currentMatchRow + 1);
        }
        // Triggered by the PATH capture, which all ten grammars already emit, rather than by a
        // separate @kinesis_route tag that only TypeScript and TSX carried. The grammar's job is to
        // point at a route path and its verb; turning that into a node is this layer's job, and
        // demanding a second redundant tag is what left eight languages silently dead (todo22#P15).
        // @route_method is the TS/TSX capture name, @infra_method the one every other grammar uses.
        else if (cName === 'kinesis_route_path') {
          const pathReg = stripQuotes(cText);
          const method = normalizeHttpMethod(captureMap['route_method'] ?? captureMap['infra_method']);
          const scopeName = getScopeAt(currentMatchRow);
          this.flow.processRoute(pathReg, method, scopeName, spectrum, context.getFramework(), currentMatchRow + 1);

          const scope = getScopeAt(currentMatchRow);
          const scopePrefix = scope ? `${scope.toLowerCase()}.` : '';
          const targetNode = nodeCache.get(`${file.path.toLowerCase()}::${scopePrefix}${scope ? scope.toLowerCase() : 'unit'}`);
          if (targetNode) {
            targetNode.metadata.isEntryPoint = true;
          }
        }
        else if (cName === 'kinesis_request_url') {
          const url = stripQuotes(cText);
          const method = normalizeHttpMethod(captureMap['req_method'] ?? captureMap['kinesis_method']);
          const scopeName = getScopeAt(currentMatchRow);
          // The RECEIVER is what tells `processRequest` this is genuinely a network call. Omitting
          // it left the gate with no evidence for a relative URL, so every `fetch('/path')` was
          // rejected as noise. `@req_fn` / `@kinesis_object` carry it depending on call shape.
          const receiver = captureMap['req_fn'] ?? captureMap['kinesis_object'] ?? null;
          this.flow.processRequest(url, method, scopeName, spectrum, receiver, currentMatchRow + 1);
        }
        else if (cName === 'pulse_type_target') {
          const scope = getScopeAt(currentMatchRow);
          this.calls.process(cText, scope, 'TYPE_REFERENCE', spectrum, [], context, currentMatchRow + 1);
        }
        else if (cName === CaptureTags.COMMENT) {
          // HARVEST THE PROSE, not only the debt markers (ADR 0133). This capture already fired on
          // every comment in every language — Python additionally tags its docstring here via
          // `(expression_statement (string)) @comment` — and only TODO/FIXME scanning read it. The
          // author's description of the symbol was parsed and discarded on every pulse.
          //
          // Collected flat and joined to declarations AFTER the walk, because the two conventions
          // sit on opposite sides of the declaration line and a row comparison covers both without
          // a per-grammar parent walk (`doc-comments.ts`).
          docComments.push({
            startLine: capture.node.startPosition.row + 1,
            endLine: capture.node.endPosition.row + 1,
            text: capture.node.text,
          });
        }
        if (cName === CaptureTags.COMMENT && provider.extractDebt) {
          const markers = provider.extractDebt(capture.node);
          if (markers.length > 0) {
            const scopeName = getScopeAt(currentMatchRow);
            const scopePrefix = scopeName ? `${scopeName.toLowerCase()}.` : '';
            const targetId = `${file.path.toLowerCase()}::${scopePrefix}${scopeName ? scopeName.toLowerCase() : 'unit'}`;
            const targetNode = nodeCache.get(targetId);
            if (targetNode) {
              if (!targetNode.metadata.debtMarkers) targetNode.metadata.debtMarkers = [];
              targetNode.metadata.debtMarkers.push(...markers);
              (targetNode as any).debtMarkers = targetNode.metadata.debtMarkers;
            }
          }
        }
      }
    }


    // Emit reference-as-value edges now that nodeCache holds every definition in this file. Gate on
    // "imported here OR defined in this file" — so a local-variable arg never floods the graph or adds
    // a dangler. IntraLinker binds the bare name against imported/same-file symbols afterward.
    for (const { scope, name, raw, line } of refValueCandidates) {
      // KEEP the resolved binding rather than using it as a yes/no gate.
      //
      // This called `resolveLocalBinding(name)` and threw the string away, then emitted the BARE
      // name as the target. `call.ts:45-53` uses the same call's result to build
      // `${resolvedPath}::${target}` — which is exactly why `CONSTRUCTS` landed on
      // `@heroicons/react/24/outline::academiccapicon` while `ACCESSES` on the same symbol in the
      // same file dangled on a bare `academiccapicon`. One processor kept the answer and the other
      // asked the same question and discarded it (todo29#P3b).
      //
      // Null is still meaningful: the symbol is then defined in THIS file (the second half of the
      // gate), and a bare name is correct there because IntraLinker binds same-file references
      // afterwards.
      const bound = context.resolveLocalBinding(name);
      if (!bound && !nodeCache.has(`${file.path.toLowerCase()}::${name}`)) continue;
      spectrum.relationships.push({
        sourceName: scope,
        targetName: bound ? `${bound}::${name}` : name,
        type: 'ACCESSES' as any,
        confidence: 0.8,
        metadata: { referenceAsValue: true, original: raw, line }
      });
    }

    // Attach `instanceOf` to the variable nodes the walk produced (todo29#P3b).
    //
    // After the loop, because the capture order inside a match is not the order the nodes were
    // created in — the same reason the reference-as-value edges are emitted here rather than inline.
    for (const [varName, typeName] of instanceTypes) {
      const node = nodeCache.get(`${file.path.toLowerCase()}::${varName}`);
      if (!node) continue;
      (node.metadata ??= {}).instanceOf = typeName;

      // Emit the relationship as a real EDGE, not just a property.
      //
      // `pruneTaxonomy` deletes an ATOM that carries no non-structural edge — ADR 0012/0013, and a
      // measured decision: emitting every local variable floods the graph. A variable whose type was
      // read had no such edge, so the node was DROPPED, `instanceOf` went with it, and a later
      // `x.method()` fell through to matching a bare method name across the file. On the oracle
      // fixture that picked the WRONG CLASS for a shadowed local.
      //
      // The fix is not to change the prune rule — it is to make the variable genuinely load-bearing.
      // A variable that IS a ServiceRegistry has a relationship to ServiceRegistry, so the existing
      // rule keeps it for the right reason, and only variables with a recorded type survive.
      spectrum.relationships.push({
        // The SCOPED key (`localscoped.client`), not the bare name. A file can hold two variables of
        // the same name in different scopes — the node ids already distinguish them, and using the
        // bare name here sent BOTH edges to the module-level node, leaving the local one edgeless
        // and therefore pruned. That is how a shadowed local lost its type entirely.
        sourceName: varName,
        // A BUILT-IN type points at its global id rather than dangling. `new Date()` makes the
        // variable a Date, which is true and worth recording — but Date is not a project node, so a
        // bare name would be permanently unresolvable. Measured: 128 such edges on subject-b (65
        // Date, 22 Set, ...), which would have doubled the dangling rate to record nothing new.
        // Same treatment calls to built-ins already get.
        targetName: isBuiltIn(typeName, provider.langId) ? getGlobalId(typeName) : typeName,
        type: 'CONSTRUCTS' as any,
        confidence: 1.0,
        metadata: { isInstanceOf: true, line: instanceTypeLines.get(varName) ?? 0 },
      });
    }
    for (const [ifaceName, members] of memberTypes) {
      const node = nodeCache.get(`${file.path.toLowerCase()}::${ifaceName}`);
      if (node) (node.metadata ??= {}).memberTypes = members;
    }
    for (const [varName, paths] of objectPaths) {
      const node = nodeCache.get(`${file.path.toLowerCase()}::${varName}`);
      if (node) (node.metadata ??= {}).objectPaths = paths;
    }
    for (const [varName, callTarget] of instanceCalls) {
      const node = nodeCache.get(`${file.path.toLowerCase()}::${varName}`);
      // A direct `new Y()` on the same variable is a better answer than a call to resolve, so it wins.
      if (node && !(node.metadata as any)?.instanceOf) (node.metadata ??= {}).instanceOfCall = callTarget;
    }

    // Next.js app-router routes, which no query can capture (todo29#P5).
    //
    // Every other route pattern matches the EXPRESS shape — `app.get('/path', handler)`, a call
    // expression naming its own path. Next.js declares a route by FILE POSITION instead, so there is
    // nothing for a query to match and 118 route files on subject-b produced ZERO route nodes:
    // conducks could see who CALLED an endpoint and not who SERVED it, on the most common React
    // stack.
    //
    // Emitted HERE, after the match loop, because it needs the file's EXPORTED names — which are
    // only complete once the walk has finished. `GET`/`POST` are exports, not calls.
    for (const { method, path: routePath } of nextRoutes(
      file.path,
      [...nodeCache.values()].filter(n => n.metadata?.isExport || n.isExport).map(n => String(n.name)),
    )) {
      this.flow.processRoute(routePath, method, 'unit', spectrum, 'nextjs');
    }

    // `nodeCache` holds the symbols discovered by the query walk, and this line REPLACES the array
    // rather than merging into it. Anything pushed to `spectrum.nodes` earlier in the walk is
    // therefore discarded — which is what happened to every route and request node
    // `FlowProcessor.processRoute`/`processRequest` created, in every language, for as long as they
    // have existed. `bindRouteCircuits` then had nothing to match, and cross-service HTTP binding
    // reported success while finding nothing (todo22#P15). Keep the virtual nodes.
    const virtualNodes = spectrum.nodes.filter(n => !nodeCache.has(String(n.name).toLowerCase()));

    // Virtual nodes (HTTP routes/requests, `FlowProcessor.processRoute`/`processRequest`) are
    // pushed straight onto spectrum.nodes, bypassing the nodeCache path above where every OTHER
    // definition gets its `fingerprint` and `layer_path` (~line 355). That is not cosmetic:
    // `fingerprint` is drift-engine's join key (todo26) — a route with none is invisible to
    // move/rename detection, and a route whose method or path changes reads as unchanged. A route
    // IS a real declaration with a stable location, so it is hashed and placed the same way a
    // symbol is, using what FlowProcessor already recorded (path/method/framework) as its DNA.
    for (const vn of virtualNodes) {
      const meta = (vn.metadata ?? (vn.metadata = {})) as Record<string, any>;
      if (!meta.fingerprint) {
        meta.fingerprint = crypto.createHash('sha256')
          .update(`${structuralPath(file.path)}|${vn.name}|${JSON.stringify(meta)}`)
          .digest('hex');
      }
      if (!meta.layer_path) {
        meta.layer_path = `${unitNode.metadata.layer_path}/${String(vn.name).toLowerCase()}`;
      }
      if (!meta.unitId) meta.unitId = fileId;
    }

    spectrum.nodes = [...Array.from(nodeCache.values()), ...virtualNodes];

    // A LOCAL DECLARATION SHADOWS A GLOBAL, which is how the language itself reads the code.
    //
    // A reference is routed to `GLOBAL::name` the moment the name is in the built-in list, and that
    // test runs before anything asks whether THIS FILE declares the name. A file declaring its own
    // `Location` therefore handed every reference to the DOM's, leaving its own declaration with no
    // incoming edge at all — reported ORPHAN, "defined but never referenced", while being used two
    // lines below. MEASURED on subject-c: `interface Location` in the weather tool, referenced twice.
    //
    // Not a one-name problem: `Request`, `Response`, `Document` and `Navigator` are on that list too,
    // and a project declaring its own Request or Response is ordinary rather than exotic.
    //
    // Applied AFTER the walk on purpose. Deciding during it would depend on whether the declaration
    // happened to be read before the use, which is a property of the file's layout and not of the
    // code's meaning. Only the local name is restored — the target falls back to the bare form that
    // graph ingestion qualifies, exactly as an ordinary same-file reference does.
    const declaredHere = new Set(
      spectrum.nodes
        .filter(n => String(n.kind) !== 'file')
        .map(n => String(n.name).toLowerCase()));
    if (declaredHere.size > 0) {
      for (const rel of spectrum.relationships) {
        const target = String(rel.targetName);
        if (!target.startsWith('GLOBAL::')) continue;
        const bare = target.slice('GLOBAL::'.length);
        if (declaredHere.has(bare)) rel.targetName = bare;
      }
    }

    // JOIN THE HARVESTED PROSE TO ITS DECLARATION (ADR 0133).
    //
    // After the walk, because a comment ABOVE a declaration is seen before the declaration exists,
    // and Python's docstring is seen after — a flat collection joined by line handles both, where a
    // per-grammar parent walk would need a different rule for each language.
    //
    // A comment is claimed by at most one symbol, so a banner above a class is not also handed to
    // its first method: the same paragraph describing two different things is the confidently-wrong
    // shape this project keeps removing.
    if (docComments.length > 0) {
      const documentable = spectrum.nodes.filter(n => (n.range?.start?.line ?? 0) > 0);
      // A PARAMETER IS NOT WHAT A DOC COMMENT DESCRIBES, and it shares its function's line. Ranking
      // it below the declaration is what stops it claiming the docstring first — measured, that one
      // tie cost two thirds of the Python docstrings and most of the JSDoc.
      // THE DOC SITS ABOVE THE FIRST OVERLOAD; THE NODE IS MINTED AT THE IMPLEMENTATION. Anchor the
      // join at the first signature of a CONTIGUOUS run ending just above the declaration — each
      // hop ≤2 lines, same rule as the doc gap itself, so an interface's same-named method three
      // screens up cannot chain in.
      const anchorOf = (n: SpectrumNode): number => {
        let anchor = n.range.start.line;
        const lines = overloadLines.get(String(n.name ?? '').toLowerCase());
        if (!lines) return anchor;
        const sorted = [...lines].sort((a, b) => b - a);
        for (const l of sorted) {
          if (l < anchor && anchor - l <= 2) anchor = l;
        }
        return anchor;
      };

      const docs = attachDocs(
        documentable.map(n => ({
          lineStart: anchorOf(n),
          // Ranked on canonicalKind, because a parameter does NOT arrive as `kind: 'parameter'` —
          // Python reports its parameters as `variable`/`ATOM`, so a check on `kind` fired never and
          // the first fix changed nothing. ATOM covers both a parameter and an inline assignment
          // sharing the line; in either case the declaration is what the comment describes.
          rank: n.canonicalKind === 'ATOM' || n.kind === 'import' ? 1 : 0,
          // The declaration's own end, so a docstring under a WRAPPED signature is still reachable.
          lineEnd: n.range?.end?.line,
          node: n,
        })),
        docComments
      );
      for (const [target, text] of docs) {
        const n = (target as { node: SpectrumNode }).node;
        n.metadata.doc = text;
        n.metadata.docFirstLine = firstLineOf(text);
      }
    }


    // Conducks: Hierarchical Unification (L2-L7 Parentage)
    // [Conducks Rule] MEMBER_OF edges are no longer persisted as structural scaffolding.
    // All containment is now column-based (parentId, unitId, structureId, etc.). 🏺

    // Conducks: Ingest Kinetic Git Signals (Only in Resolution Mode)
    if (!context.isDiscoveryMode()) {
      // ONE git invocation for both, not three. These two lines used to call
      // `getCommitResonance` and `getAuthorDistribution` back to back, which spawned
      // `rev-list --count` plus the SAME `git log --format=%ae` twice. A CPU profile of this
      // function put 86% of its time in git subprocesses and under 1% in tree-sitter, so the spawn
      // count is what parse speed is made of. Both public methods stay for their other callers.
      const history = await chronicle.getFileHistory(file.path);
      const resonance = history ? { count: history.count, authors: history.authors } : { count: 0 };
      const distribution = history?.distribution ?? {};
      const blameData = (await chronicle.getBlameData(file.path)) || [];
      const entropyRaw = calculateShannonEntropy(distribution);
      const entropyRisk = normalizeEntropyRisk(entropyRaw, Object.keys(distribution).length);
      const now = Math.floor(Date.now() / 1000);

      for (const n of spectrum.nodes) {
        // Blame Attribution
        const startLine = n.range.start.line;
        const endLine = n.range.end.line;
        const authors: Record<string, number> = {};
        let latestTime = 0;
        let earliestTime = now;

        for (let line = startLine; line <= endLine; line++) {
          if (!Array.isArray(blameData) || !(line in blameData)) continue;
          const meta = blameData[line];
          if (meta) {
            authors[meta.author] = (authors[meta.author] || 0) + 1;
            if (meta.timestamp > latestTime) latestTime = meta.timestamp;
            if (meta.timestamp < earliestTime) earliestTime = meta.timestamp;
          }
        }

        const authorEntries = Object.entries(authors);
        const primary = authorEntries.length > 0 ? authorEntries.sort((a, b) => b[1] - a[1])[0][0] : '';
        const count = authorEntries.length;
        const tenure = Math.floor((now - earliestTime) / 86400);

        n.metadata.kinetic = {
          resonance: resonance.count,

          entropy: entropyRisk,
          primaryAuthor: primary,
          authorCount: count,
          lastModified: latestTime,
          tenureDays: tenure > 0 ? tenure : 0,
          debtMarkers: n.metadata.debtMarkers || [],
          coveredBy: []
        };

        // Sync with top-level properties for persistence mapping
        (n as any).risk = n.metadata.risk || 0;
        (n as any).gravity = n.metadata.gravity || 0;
        (n as any).complexity = n.metadata.complexity || 0;
        (n as any).kinetic = n.metadata.kinetic;
        (n as any).dna = n.metadata.dna;
        (n as any).signature = n.metadata.signature;
        (n as any).fingerprint = n.metadata.fingerprint;
        (n as any).layer_path = n.metadata.layer_path;
        (n as any).depth = n.metadata.depth;
        (n as any).parentId = n.metadata.parentId;
        (n as any).unitId = n.metadata.unitId;
        (n as any).namespaceId = n.metadata.namespaceId;
        (n as any).rootId = n.metadata.rootId;
        (n as any).structureId = n.metadata.structureId;
      }
    }
    
    this.markTypeOnlyImports(spectrum);

    // Seed Import Map (Only in Discovery Mode)
    if (context.isDiscoveryMode()) {
      spectrum.relationships.filter(r => r.type === 'IMPORTS').forEach(r => {
        context.registerImport(file.path.toLowerCase(), r.targetName.toLowerCase());
      });
    }

    return spectrum;
  }
  /**
   * Conducks — Type-only import marking (ADR 0016). 🧬
   *
   * A dependency is what survives compilation: TypeScript erases an import whose bindings are only
   * ever used in type position, even when written as a plain `import { X } from`. Such an edge is
   * still recorded, but must not count as runtime coupling for cycle / hub findings.
   *
   * Marking requires POSITIVE evidence of a type use and NO evidence of a value use. A binding with
   * no usage relationships at all stays a value import — capture coverage is incomplete (bare value
   * uses like `foo(Bar)` or `export { Bar }` may emit nothing), so absence of evidence must not read
   * as type-only. Over-counting coupling is visible; hiding a real cycle is not (ADR 0016).
   */
  private markTypeOnlyImports(spectrum: PrismSpectrum): void {
    // In resolution mode a target is rewritten to a resolved id (`path::symbol`, or a dotted member
    // expression), so compare against the trailing segment rather than the raw string.
    const leaf = (name: string): string => name.split('::').pop()!.split('.').pop()!;

    // Node IDs are lowercased (required for APFS), which collapses a local variable onto a
    // same-named type — `nodeId` and `NodeId` both key to `nodeid`, so the variable's value uses
    // would mark the TYPE as value-used. Producers keep the pre-lowercase name in
    // `metadata.original`; prefer it so type and value namespaces stay distinct. Heritage targets
    // are never lowercased, so their targetName is already case-accurate.
    const caseSafeName = (rel: any): string | null => {
      const original = rel.metadata?.original;
      if (typeof original === 'string' && original) return leaf(original);
      if (rel.type === 'EXTENDS' || rel.type === 'IMPLEMENTS') return leaf(String(rel.targetName));
      return null;
    };

    const valueUses = new Set<string>();
    const typeUses = new Set<string>();
    // Names seen in a value position with no case-accurate spelling available. Matched
    // case-insensitively as a fallback so an unattributable use still blocks a type-only call.
    const valueUsesFolded = new Set<string>();

    for (const rel of spectrum.relationships) {
      // EXTENDS is a value use — a base class is a runtime binding. IMPLEMENTS is type-only.
      const isValue = rel.type === 'CALLS' || rel.type === 'CONSTRUCTS' || rel.type === 'ACCESSES' || rel.type === 'EXTENDS';
      const isType = rel.type === 'TYPE_REFERENCE' || rel.type === 'IMPLEMENTS';
      if (!isValue && !isType) continue;

      const name = caseSafeName(rel);
      if (isType) {
        if (name) typeUses.add(name);
      } else if (name) {
        valueUses.add(name);
      } else {
        valueUsesFolded.add(leaf(String(rel.targetName)).toLowerCase());
      }
    }

    const isTypeOnly = (binding: string): boolean => {
      const name = leaf(binding);
      return typeUses.has(name) && !valueUses.has(name) && !valueUsesFolded.has(name.toLowerCase());
    };

    // Per-binding edges first; the file-level edge is type-only only if every binding it carries is.
    const bindingsBySpecifier = new Map<string, { total: number; typeOnly: number }>();

    for (const rel of spectrum.relationships) {
      if (rel.type !== 'IMPORTS' || !rel.metadata?.isRawBinding) continue;
      const specifier = String(rel.metadata.specifier);
      const typeOnly = isTypeOnly(String(rel.metadata.bindingNameRaw ?? rel.metadata.bindingName));
      if (typeOnly) rel.metadata.isTypeOnly = true;

      const tally = bindingsBySpecifier.get(specifier) || { total: 0, typeOnly: 0 };
      tally.total++;
      if (typeOnly) tally.typeOnly++;
      bindingsBySpecifier.set(specifier, tally);
    }

    for (const rel of spectrum.relationships) {
      if (rel.type !== 'IMPORTS' || !rel.metadata?.isRaw) continue;
      const tally = bindingsBySpecifier.get(String(rel.metadata.specifier));
      // A side-effect import (`import './x.js'`) carries no bindings — it is a real runtime edge.
      if (tally && tally.total > 0 && tally.total === tally.typeOnly) {
        rel.metadata.isTypeOnly = true;
      }
    }
  }

}

