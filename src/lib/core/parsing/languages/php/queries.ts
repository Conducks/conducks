/**
 * Conducks — High-Fidelity PHP SCM Query 🏺 🟦 (Omni-Detail)
 */
export const PHP_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (namespace_use_declaration
    (namespace_use_clause
      (qualified_name) @source)) @isImport
  (namespace_use_declaration
    (namespace_use_clause
      (namespace_aliasing_clause
        (qualified_name) @source))) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (property_declaration (variable_name) @name) @isProperty
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
  (namespace_use_clause
    name: (_) @source
    alias: (namespace_aliasing_clause
      name: (name) @isBinding)) @isImport

  ;; --- Trait Conflict Resolution (insteadof) ---
  (use_instead_of_clause
    (name) @isHeritage
    (name) @source) @isInfra

  ;; --- Debt Markers ---
  (comment) @comment
`;
