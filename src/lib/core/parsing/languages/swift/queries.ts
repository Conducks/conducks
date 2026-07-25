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
  (class_declaration declaration_kind: "class" name: (type_identifier) @name) @isClass
  (class_declaration declaration_kind: "actor" name: (type_identifier) @name) @isClass
  (class_declaration declaration_kind: "struct" name: (type_identifier) @name) @isStruct
  (class_declaration declaration_kind: "enum" name: (type_identifier) @name) @isEnum
  ;; An extension's name is a (user_type) — capturing the inner (type_identifier) double-matches on
  ;; a qualified target like 'extension String.SubSequence'.
  (class_declaration declaration_kind: "extension" name: (user_type) @name) @isStruct
  (protocol_declaration name: (type_identifier) @name) @isInterface
  (typealias_declaration name: (type_identifier) @name) @isInterface
  (associatedtype_declaration name: (type_identifier) @name) @isInterface

  ;; --- Behavior ---
  ;; NO @isAsync / @isExported here on purpose. Both are reflector-level dead ends today:
  ;;   - within a match the LAST 'is*' capture wins node.kind, so a modifier capture that lands after
  ;;     the definition capture rewrites a function into kind 'async'/'exported' (canonical ATOM);
  ;;   - a separate modifier-only pattern cannot win either, because query.matches() is NOT ordered by
  ;;     pattern index, and dna is filled by whichever match reaches the symbol first.
  ;; Re-add once reflector.ts excludes modifier captures from the kind branch (see todo13 report).
  (function_declaration name: (simple_identifier) @name) @isFunction
  (init_declaration name: _ @name) @isFunction
  (deinit_declaration "deinit" @name) @isFunction
  (protocol_function_declaration name: (simple_identifier) @name) @isMethod

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
