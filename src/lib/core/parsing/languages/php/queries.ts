/**
 * Conducks — High-Fidelity PHP SCM Query 🏺 🟦 (Omni-Detail)
 */
export const PHP_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (namespace_use_declaration
    (namespace_use_clause
      (qualified_name) @source)) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  ;; tree-sitter-php 0.24: the variable sits under (property_element name: (variable_name)),
  ;; never directly under (property_declaration).
  (property_declaration (property_element name: (variable_name) @name)) @isProperty
  (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration (name) @name) @isStruct
  (interface_declaration (name) @name) @isInterface
  (trait_declaration (name) @name) @isStruct
  (enum_declaration (name) @name) @isEnum
  
  (function_definition (name) @name) @isFunction
  (method_declaration (name) @name) @isMethod
  
  (namespace_definition (namespace_name) @name) @isPackage
  
  ;; --- Infrastructure (L3: Entry Points) ---
  ;; Laravel / Symfony Route Attributes: #[Get('/')]
  (attribute
    (name) @infra_method (#match? @infra_method "^(Get|Post|Put|Delete|Patch|Route)$")
    (_) @kinesis_route_path) @isInfra

  ;; gRPC / Protobuf
  (function_call_expression
    (name) @infra_method (#match? @infra_method "^register.*$")) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (function_call_expression [(name) (relative_name) (member_call_expression) (qualified_name)] @kinesis_target)
  (member_call_expression (name) @kinesis_target)
  
  ;; --- Namespace Alias (use A\B as C) ---
  ;; tree-sitter-php 0.24 flattened the old (namespace_aliasing_clause) into an "alias:" field.
  (namespace_use_clause
    [(qualified_name) (name)] @source
    alias: (name) @isBinding) @isImport

  ;; --- Trait Conflict Resolution (insteadof) ---
  ;; "T1::hi insteadof T2" — the left side is a (class_constant_access_expression), not a bare (name).
  (use_instead_of_clause
    (class_constant_access_expression . (name) @isHeritage)
    (name) @source) @isInfra

  ;; --- Debt Markers ---
  (comment) @comment
`;
