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
  ;; `for (const k in TABLE)` AND `for (const x of LIST)`.
  ;;
  ;; The tree-sitter node for both is `for_in_statement` in the ECMAScript grammars — `of` is an
  ;; operator inside it, not a separate node — so this one pattern already covers both spellings.
  ;; Kept as one line with this note because the absence of a `for_of_statement` pattern reads like
  ;; a gap and was investigated as one (todo66): the grammar simply has no such node.
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
