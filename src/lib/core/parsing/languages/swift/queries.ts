/**
 * Conducks — High-Fidelity Swift SCM Query 🏺 🟦 (Omni-Detail)
 */
export const SWIFT_QUERIES = `
  ;; --- Definitions (Minimal Native-Safe Set) ---
  (class_declaration name: (_) @name) @isClass
  (function_declaration name: (_) @name) @isFunction
  (init_declaration) @isFunction
  (import_declaration (identifier (simple_identifier) @name)) @isPackage

  ;; --- Infrastructure (Vapor Routes) ---
  (call_expression
    (navigation_expression (simple_identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|on)$"))
    (call_suffix (value_arguments (value_argument (line_string_literal) @kinesis_route_path)))) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment (simple_identifier) @pulse_assignment_name (_) @pulse_assignment_value)

  ;; --- Kinesis (Execution Flow) ---
  (call_expression [(navigation_expression) (simple_identifier)] @kinesis_target)
  (call_expression (simple_identifier) @kinesis_target)

  ;; --- Debt Markers ---
  (comment) @comment
`;
