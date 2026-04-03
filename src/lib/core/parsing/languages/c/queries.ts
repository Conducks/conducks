/**
 * Conducks — High-Fidelity C SCM Query 🏺 🟦 (Omni-Detail)
 */
export const C_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (field_identifier) @name) @isProperty
  (declaration (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (function_definition (function_declarator (identifier) @name)) @isFunction
  (struct_specifier (type_identifier) @name) @isStruct
  (union_specifier (type_identifier) @name) @isStruct
  (enum_specifier (type_identifier) @name) @isStruct
  
  ;; --- Infrastructure (L3: Entry Points) ---
  (preproc_include (_) @name) @isPackage
  (preproc_def (identifier) @name) @isMacro
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (identifier) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression (identifier) @kinesis_target)
  
  (comment) @comment
`;
