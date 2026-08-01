/**
 * Conducks — High-Fidelity Swift SCM Query 🏺 🟦 (Omni-Detail)
 *
 * Grammar contract: tree-sitter-swift 0.7.1 (alex-pinkus).
 * That grammar has NO `struct_declaration` / `enum_declaration` / `extension_declaration`. Every
 * nominal type folds into `class_declaration`, discriminated by the anonymous `declaration_kind:`
 * field (class | actor | struct | enum | extension). Asking for the missing node types failed the
 * WHOLE query (TSQueryErrorNodeType at 146), which silently dropped every .swift file to the Gnosis
 * file-only fallback. Every pattern below is compiled against the installed grammar by
 * tests/unit/core/languages/swift-extraction.test.ts — keep it that way.
 */
export const SWIFT_QUERIES = `
  ;; --- Imports ---
  ;; (identifier) holds the whole dotted module path (import A.B); (simple_identifier) is one segment.
  (import_declaration (identifier) @source) @isImport

  ;; --- Nominal Types (all one node type, split by declaration_kind) ---
  ;; VISIBILITY (@isExported): the optional group must select the public-ish keywords with an
  ;; anonymous-token ALTERNATION, never a (#match?) predicate. A predicate over an unbound optional
  ;; capture FAILS instead of passing vacuously, which silently drops every declaration that has no
  ;; visibility modifier (probed: 2 of 5 funcs survived). The alternation keeps one match per
  ;; declaration and binds @isExported only for public / open / package.
  (class_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? declaration_kind: "class" name: (type_identifier) @name) @isClass
  (class_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? declaration_kind: "actor" name: (type_identifier) @name) @isClass
  (class_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? declaration_kind: "struct" name: (type_identifier) @name) @isStruct
  (class_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? declaration_kind: "enum" name: (type_identifier) @name) @isEnum
  ;; An extension's name is a (user_type) — capturing the inner (type_identifier) double-matches on
  ;; a qualified target like 'extension String.SubSequence'.
  (class_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? declaration_kind: "extension" name: (user_type) @name) @isStruct
  (protocol_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? name: (type_identifier) @name) @isInterface
  (typealias_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? name: (type_identifier) @name) @isInterface
  (associatedtype_declaration name: (type_identifier) @name) @isInterface

  ;; --- Behavior ---
  ;; @isAsync / @isExported ride the SAME pattern as @isFunction on purpose: dna is filled from the
  ;; match that CREATES the node, and query.matches() is NOT ordered by pattern index, so a separate
  ;; modifier-only pattern would set the flag only by luck. Both are quantified (?) so a plain
  ;; non-async, non-public func still produces exactly one match. Safe only because reflector.ts now
  ;; gates the kind branch on DEFINITION_CAPTURES — before that, @isAsync overwrote kind with 'async'
  ;; (canonical ATOM) and demoted the symbol. See todo13.
  ;; Return-type capture (ADR 0086/0084) — but NOT @params. tree-sitter-swift 0.7.1 does not wrap a
  ;; function's VALUE parameters in any node: 'func f(a: String, b: Int)' puts 'parameter' nodes as
  ;; direct, field-less children of function_declaration itself, alongside its own name and body (
  ;; confirmed against node-types.json: function_declaration's 'children' list, not its 'fields',
  ;; is where 'parameter' lives). The frozen reflector.ts helper reads @params by iterating the
  ;; NAMED CHILDREN of ONE captured node; capturing function_declaration itself would pull in the
  ;; function's own name and return type as fake "parameters" — a fabrication worse than an empty
  ;; array, so @params is deliberately NOT captured here. Reported as a finding rather than worked
  ;; around: reflector.ts would need to accept a node-TYPE filter ('only namedChildren of type
  ;; parameter') to support this grammar, and that is a change to the frozen helper, not to a query.
  ;;
  ;; @return_type is captured despite the grammar aliasing it to the SAME field id as the function's
  ;; own name ('name:' — verified by both node-types.json's 'multiple: true' on that field and by a
  ;; live query probe: 'return_type: (user_type)' compiles but matches NOTHING, silently, the ADR
  ;; 0071 failure shape). Constraining 'name:' TWICE in one pattern — once to (simple_identifier) for
  ;; the function's own name, once to the return type's own node kinds — reads correctly: only a
  ;; function that actually declares '-> T' produces a second 'name:' child, so the capture is
  ;; absent (not a wrong guess) when nothing is written.
  (function_declaration (modifiers (visibility_modifier ["public" "open" "package"]) @isExported)? name: (simple_identifier) @name name: [(user_type) (array_type) (dictionary_type) (optional_type) (tuple_type) (function_type)]? @return_type "async"? @isAsync) @isFunction
  (init_declaration name: _ @name) @isFunction
  (deinit_declaration "deinit" @name) @isFunction
  (protocol_function_declaration name: (simple_identifier) @name name: [(user_type) (array_type) (dictionary_type) (optional_type) (tuple_type) (function_type)]? @return_type) @isMethod

  ;; --- State ---
  ;; let/var is a (property_declaration) everywhere, so the PARENT decides member vs local.
  (class_body (property_declaration name: (pattern bound_identifier: (simple_identifier) @name)) @isProperty)
  (enum_class_body (property_declaration name: (pattern bound_identifier: (simple_identifier) @name)) @isProperty)
  (enum_class_body (enum_entry name: (simple_identifier) @name) @isProperty)
  (protocol_property_declaration name: (pattern bound_identifier: (simple_identifier) @name)) @isProperty
  (source_file (property_declaration name: (pattern bound_identifier: (simple_identifier) @name)) @isVariable)
  (statements (property_declaration name: (pattern bound_identifier: (simple_identifier) @name)) @isVariable)

  ;; --- Protocol Conformances / Superclass (IMPLEMENTS + EXTENDS edges) ---
  ;; No kind capture: the type node already exists from the patterns above, and @heritage needs the
  ;; owning @name in the SAME match to resolve its source.
  (class_declaration name: (_) @name (inheritance_specifier inherits_from: (_) @heritage))
  (protocol_declaration name: (type_identifier) @name (inheritance_specifier inherits_from: (_) @heritage))

  ;; --- Infrastructure (Vapor Routes) ---
  (call_expression
    (navigation_expression (navigation_suffix (simple_identifier) @infra_method)
      (#match? @infra_method "^(get|post|put|delete|patch|on)$"))
    (call_suffix (value_arguments (value_argument (line_string_literal) @kinesis_route_path)))) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment
    target: (directly_assignable_expression (simple_identifier) @pulse_assignment_name)
    result: (_) @pulse_assignment_value)

  ;; --- Kinesis (Execution Flow) ---
  (call_expression (navigation_expression) @kinesis_target)
  (call_expression (simple_identifier) @kinesis_target)

  ;; --- Debt Markers ---
  (comment) @comment
  (multiline_comment) @comment
`;
