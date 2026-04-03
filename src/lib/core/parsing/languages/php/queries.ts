/**
 * Conducks — High-Fidelity PHP SCM Query 🏺 🟦 (Omni-Detail)
 */
export const PHP_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (property_declaration (variable_name) @name) @isProperty
  (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration (name) @name) @isStruct
  (interface_declaration (name) @name) @isInterface
  (trait_declaration (name) @name) @isStruct
  (enum_declaration (name) @name) @isStruct
  
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
  
  ;; --- Debt Markers ---
  (comment) @comment
`;
