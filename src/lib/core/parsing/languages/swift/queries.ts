/**
 * Conducks — High-Fidelity Swift SCM Query 🏺 🟦 (Omni-Detail)
 */
export const SWIFT_QUERIES = `
  ;; --- Definitions (Minimal Native-Safe Set) ---
  (class_declaration name: (_) @name) @isClass
  ;; Swift value types and protocols (PG24)
  (struct_declaration name: (_) @name) @isStruct
  (enum_declaration name: (_) @name) @isEnum
  (protocol_declaration name: (_) @name) @isInterface
  (extension_declaration (type_identifier) @name) @isStruct
  (typealias_declaration name: (_) @name) @isInterface
  (function_declaration name: (_) @name) @isFunction
  (init_declaration) @isFunction
  (import_declaration (identifier (simple_identifier) @source)) @isImport

  ;; --- Infrastructure (Vapor Routes) ---
  (call_expression
    (navigation_expression (simple_identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|on)$"))
    (call_suffix (value_arguments (value_argument (line_string_literal) @kinesis_route_path)))) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment (simple_identifier) @pulse_assignment_name (_) @pulse_assignment_value)

  ;; --- Kinesis (Execution Flow) ---
  (call_expression [(navigation_expression) (simple_identifier)] @kinesis_target)
  (call_expression (simple_identifier) @kinesis_target)

  ;; --- Property Wrappers (@State, @Binding, @Published, @ObservedObject etc.) ---
  (attribute
    name: (simple_identifier) @source) @isProperty

  ;; --- Protocol Conformances (IMPLEMENTS edge) ---
  (class_declaration
    name: (type_identifier) @isClass
    inheritance_specifiers:
      (inheritance_specifier
        name: (_) @isHeritage))

  (struct_declaration
    name: (type_identifier) @isStruct
    inheritance_specifiers:
      (inheritance_specifier
        name: (_) @isHeritage))

  ;; --- Debt Markers ---
  (comment) @comment
`;
