/**
 * Conducks — High-Fidelity C++ SCM Query 🏺 🟦 (Omni-Detail)
 */
export const CPP_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (field_identifier) @name) @isProperty
  (declaration (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  ;; Classes and Structs
  (class_specifier (type_identifier) @name) @isStruct
  (struct_specifier (type_identifier) @name) @isStruct
  
  ;; Namespaces (Resonance Shield)
  (namespace_definition (_) @name) @isPackage
  
  ;; Templates
  (template_declaration) @isGeneric
  
  ;; Functions and Methods
  (function_definition (function_declarator (identifier) @name)) @isFunction
  (function_definition (function_declarator (field_identifier) @name)) @isMethod
  
  ;; Destructors (Flat Capture)
  (destructor_name) @name
  
  ;; --- Infrastructure (L3: Entry Points) ---
  (preproc_include (_) @name) @isPackage
  (preproc_def (_) @name) @isMacro
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (identifier) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression [(identifier) (field_identifier) (field_expression) (qualified_identifier)] @kinesis_target)
  
  ;; --- Debt Markers ---
  (comment) @comment
`;
