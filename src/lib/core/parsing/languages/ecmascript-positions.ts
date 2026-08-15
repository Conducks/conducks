/**
 * Conducks — the ECMAScript-family USE POSITIONS, written once. 🏺
 *
 * `typescript`, `tsx` and `javascript` are one grammar family: tree-sitter-typescript exposes tsx as
 * a second language over the same node types, and the JavaScript grammar shares every value-position
 * node with both. Their queries were maintained as three hand-copied files, and the copying drifted:
 *
 *   - 7 value patterns were byte-identical across all three files.
 *   - 12 type patterns were byte-identical across typescript and tsx.
 *   - **JavaScript was missing `for_in_statement`** — `for (const k in TABLE)` is a read of `TABLE`
 *     in JS exactly as it is in TypeScript, and the pattern simply never got copied across. Nothing
 *     detected it, because nothing compared the three files.
 *
 * That last line is the argument for this file. Eleven use-positions were added across one session,
 * each by editing two or three files by hand; a fix that fails to propagate is invisible, while a
 * duplicated block that drifts is only found by diffing files nobody diffs.
 *
 * WHAT IS NOT SHARED, and why: the node NAMES differ outside this family. Python spells the same
 * ideas `list` and `conditional_expression`, Rust uses `::` paths, Go has no ternary at all. Sharing
 * across those would mean inventing an abstraction over tree-sitter node types — a second grammar
 * language to maintain, for three consumers. The honest boundary is the family that genuinely shares
 * node types, and that is these three.
 *
 * THE TRADE THIS MAKES: a mistake here reaches three languages at once, where a hand-copied mistake
 * reached one. That is the right way round — `tests/unit/core/parsing/position-parity.test.ts` fails
 * if a grammar in this family stops composing these blocks, so drift cannot come back, and the full
 * suite plus three frozen subjects measure the blast radius of any change to them.
 */

/**
 * A name READ in a value position. Every one of these is a USE, and each was added because a real
 * project reported live code as dead without it.
 *
 * `member_expression` covers a member READ (`Reason.Timeout`); a member CALL was already visible
 * through the kinesis patterns. `export_statement value:` is the DEFAULT export (`export default
 * Card`) — the named form `export { X }` is a separate pattern in each file, because JavaScript's
 * export clause node differs from TypeScript's.
 */
export const EC_VALUE_POSITIONS = `
  ;; --- Value positions: a name READ is a use (shared, ecmascript-positions.ts) ---
  (pair value: (identifier) @ref_value)
  (object (shorthand_property_identifier) @ref_value)
  (array (identifier) @ref_value)
  (ternary_expression (identifier) @ref_value)
  (member_expression object: (identifier) @ref_value)
  ;; BOTH OPERANDS OF ANY BINARY EXPRESSION, not just the right side of instanceof.
  ;;
  ;; The narrow instanceof pattern was written for one shape and read as if it covered the node. It
  ;; does not: a nullish-coalescing fallback and a logical-or fallback both name something that is
  ;; plainly used, and both were invisible. MEASURED on subject-c, defaultBuildInput and
  ;; spawnOsascript were reported dead while being the fallback on the line that returns them.
  ;;
  ;; Nullish-coalescing and logical-or are the shapes that matter, but there is no reason to
  ;; enumerate operators — an operand of plus or strict-equals is read exactly as much, and listing
  ;; them one at a time is how the instanceof pattern came to be mistaken for full coverage.
  (binary_expression left: (identifier) @ref_value)
  (binary_expression right: (identifier) @ref_value)
  (export_statement value: (identifier) @ref_value)
  (for_in_statement right: (identifier) @ref_value)
  ;; EVERY identifier ARGUMENT of a call, not just the first.
  ;;
  ;; The kinesis pattern captures arguments as (arguments (_)* @kinesis_arg), and that quantifier
  ;; yields exactly ONE capture — probed against the real grammar: useSyncExternalStore(subA, subB,
  ;; subC) produces a single match carrying subA and nothing else. So every argument after the first
  ;; was invisible to the reference-as-value path, and a callback handed over in second position
  ;; read as unreferenced.
  ;;
  ;; MEASURED on the monorepo subject: getSnapshot and getServerSnapshot, arguments 2 and 3 of
  ;; useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), were both reported ORPHAN while
  ;; the first argument resolved fine.
  ;;
  ;; Captured SEPARATELY rather than by fixing the quantifier in place: this pattern matches once per
  ;; argument, and folding that into the kinesis pattern would multiply its match count and with it
  ;; the CALLS edges it emits.
  (call_expression arguments: (arguments (identifier) @ref_value))
  ;; A DESTRUCTURING DEFAULT names the fallback it falls back TO:
  ;;   const { shouldRetry = shouldRetryError } = options
  ;; The identifier sits in an object_assignment_pattern beside the shorthand name, and no other
  ;; pattern reached it. MEASURED on the monorepo subject: shouldRetryError was reported ORPHAN while
  ;; being the default for shouldRetry twenty-five lines below its own declaration.
  (object_assignment_pattern (identifier) @ref_value)
`;

/**
 * A DYNAMIC IMPORT IS AN IMPORT, whatever is done with the promise.
 *
 * The only dynamic form captured was `const { X } = await import('...')`, anchored on the
 * variable_declarator — so the awaited, destructured shape was an import and every other shape was
 * nothing at all. The one that matters is lazy component loading, which neither awaits nor
 * destructures:
 *
 *   React.lazy(() => import('../plugins/core/approval/ApprovalInfoView'))
 *
 * MEASURED on subject-a: 13 plugin views, every one of them registered exactly this way in
 * `renderer/src/lib/plugin-ui.ts`, were reported as UNIMPORTED_MODULE — "nothing imports this file"
 * — while that file imports all 13 on consecutive lines. Probed against the real grammar: this
 * pattern yields 17 matches in that file alone.
 *
 * Anchored on the CALL rather than on what surrounds it, because what surrounds it is the part that
 * varies — awaited, returned from an arrow, handed to a router, chained with `.then`. The importing
 * FILE is the fact all of those share.
 *
 * It fires a SECOND time on the awaited-destructured form above, whose own pattern also carries a
 * `@source`. That is a duplicate raw specifier for one line, and the graph carries one edge per
 * (source, target, type) — measured, not assumed: total edge count is unchanged on this repository.
 */
export const EC_DYNAMIC_IMPORT = `
  ;; --- Dynamic import, any surrounding shape (shared, ecmascript-positions.ts) ---
  (call_expression function: (import) arguments: (arguments (string) @source)) @isImport @dynamic_import
`;

/**
 * A DEFAULT PARAMETER VALUE names the thing it falls back to, and that is a use:
 *
 *   function registerMacosTools(registry: Registry, run: AppleScriptRunner = spawnOsascript)
 *
 * MEASURED on subject-c: `spawnOsascript` was reported as never referenced while being the default
 * for the parameter on the same line as its only consumer.
 *
 * TYPESCRIPT AND TSX ONLY, and the split is not cosmetic. Probed against both grammars: a TypeScript
 * parameter is a `required_parameter` EVEN WITHOUT A TYPE ANNOTATION, while JavaScript has no such
 * node and spells the same code `assignment_pattern`. Naming `required_parameter` in the shared block
 * makes the JavaScript query fail to COMPILE — `TSQueryErrorNodeType` — which drops every .js file to
 * the regex fallback silently (ADR 0089). The JavaScript form lives in that grammar's own file.
 */
export const TS_PARAM_DEFAULTS = `
  ;; --- Parameter defaults, TS/TSX only (shared, ecmascript-positions.ts) ---
  (required_parameter value: (identifier) @ref_value)
  (optional_parameter value: (identifier) @ref_value)
`;

/**
 * A name READ in a TYPE position. TypeScript and TSX only — JavaScript has no type syntax, and
 * naming a node type that does not exist in a grammar makes the WHOLE query invalid, which silently
 * drops every file of that language to the regex fallback (ADR 0089).
 *
 * Each entry anchors on its own parent rather than capturing `(type_identifier)` blanketly: a
 * blanket capture also fires on a declaration's OWN name node and produces a self-referencing edge.
 */
export const TS_TYPE_POSITIONS = `
  ;; --- Type positions, ADR 0016 (shared, ecmascript-positions.ts) ---
  (type_annotation (type_identifier) @pulse_type_target)
  (type_annotation (generic_type name: (type_identifier) @pulse_type_target))
  (type_arguments (type_identifier) @pulse_type_target)
  (type_arguments (generic_type name: (type_identifier) @pulse_type_target))
  (constraint (type_identifier) @pulse_type_target)
  (array_type (type_identifier) @pulse_type_target)
  (array_type (generic_type name: (type_identifier) @pulse_type_target))
  (parenthesized_type (type_identifier) @pulse_type_target)
  (as_expression (type_identifier) @pulse_type_target)
  (type_predicate type: (type_identifier) @pulse_type_target)
  (union_type (type_identifier) @pulse_type_target)
  (intersection_type (type_identifier) @pulse_type_target)
  (conditional_type (type_identifier) @pulse_type_target)
`;
