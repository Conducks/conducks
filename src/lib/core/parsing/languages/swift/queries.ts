/**
 * Conducks — High-Fidelity Swift SCM Query 🏺 🟦 (Omni-Detail)
 */
export const SWIFT_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (property_declaration (pattern (simple_identifier) @name)) @isProperty
  (value_binding_pattern (simple_identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  (struct_declaration name: (type_identifier) @name) @isStruct
  (enum_declaration name: (type_identifier) @name) @isStruct
  (actor_declaration name: (type_identifier) @name) @isStruct
  (protocol_declaration name: (type_identifier) @name) @isInterface
  
  (extension_declaration type: (user_type (type_identifier) @name)) @isHeritage
  
  (function_declaration name: (simple_identifier) @name) @isFunction
  (init_declaration) @isFunction
  
  (import_declaration (identifier (simple_identifier) @name)) @isPackage
  
  ;; --- Infrastructure (L3: Entry Points) ---
  ;; SwiftUI Body: var body: some View { ... }
  (property_declaration
    (pattern (simple_identifier) @name (#eq? @name "body"))
    (type_annotation (opaque_type))) @isInfra

  ;; Vapor Routes: app.get("path") { ... }
  (call_expression
    function: (navigation_expression (simple_identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|on)$"))
    arguments: (call_argument_list (call_argument (string_literal) @kinesis_route_path))) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment (simple_identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression function: [(navigation_expression) (simple_identifier)] @kinesis_target)
  (call_expression function: (simple_identifier) @kinesis_target)
  
  ;; --- Debt Markers ---
  (comment) @comment
`;
