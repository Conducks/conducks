  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (field_identifier) @name) @isProperty
  (declaration (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  ;; Classes and Structs
  (class_specifier (type_identifier) @name) @isStruct
  (struct_specifier (type_identifier) @name) @isStruct
  (enum_specifier (type_identifier) @name) @isEnum
  
  ;; Namespaces (Resonance Shield)
  (namespace_definition (_) @name) @isNamespace
  
  ;; Templates
  (template_declaration) @isGeneric
  
  ;; Functions and Methods
  ;; Probed against tree-sitter-cpp (node-types.json + a live parse): unlike C, `type` is OPTIONAL on
  ;; function_definition — a constructor/destructor carries no type field at all, so the `?` here is
  ;; load-bearing, not decorative (ADR 0086: "a constructor has no return type; do not invent one").
  ;; `parameters` is REQUIRED on function_declarator, same as C.
  ;;
  ;; KNOWN GAP (reported, not fixed — reflector.ts is frozen): same as C — a parameter_declaration's
  ;; identifier lives on the `declarator` field, which paramsOf()'s fallback chain does not check, so
  ;; a typed parameter's recorded name is the whole declaration text rather than the bare identifier.
  (function_definition
    type: (_)? @return_type
    declarator: (function_declarator
      (identifier) @name
      parameters: (parameter_list) @params)) @isFunction
  (function_definition
    type: (_)? @return_type
    declarator: (function_declarator
      (field_identifier) @name
      parameters: (parameter_list) @params)) @isMethod
  
  ;; Destructors (Flat Capture)
  (destructor_name) @name
  
  ;; --- Infrastructure (L3: Entry Points) ---
  (preproc_include
    path: [(string_literal) (system_lib_string)] @source) @isImport
  (preproc_def (_) @name) @isMacro
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (identifier) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression [(identifier) (field_identifier) (field_expression) (qualified_identifier)] @kinesis_target)
  
  ;; --- Debt Markers ---
  (comment) @comment
