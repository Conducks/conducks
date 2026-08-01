/**
 * Conducks — High-Fidelity C SCM Query 🏺 🟦 (Omni-Detail)
 */
export const C_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (field_identifier) @name) @isProperty
  (declaration (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  ;; Probed against tree-sitter-c (node-types.json + a live parse): \`type\` is a REQUIRED field on
  ;; function_definition and \`parameters\` a REQUIRED field on function_declarator, so neither needs
  ;; the \`?\` quantifier TSX/TypeScript use for their optional return type.
  ;;
  ;; KNOWN GAP (reported, not fixed — reflector.ts is frozen): a C parameter_declaration exposes its
  ;; identifier through the \`declarator\` field, which reflector.ts's paramsOf() fallback chain
  ;; (pattern -> name -> node text) does not check, so a typed parameter's recorded name is the whole
  ;; declaration text ("int a") rather than the bare identifier ("a"); \`type\` is still correct since
  ;; that field name does match. The C \`(void)\` empty-parameter idiom is a second, separate gap: it
  ;; parses as one parameter_declaration (type "void", no declarator), so a genuinely zero-argument
  ;; function written as \`f(void)\` records one spurious parameter — \`f()\` does not have this problem.
  (function_definition
    type: (_) @return_type
    declarator: (function_declarator
      (identifier) @name
      parameters: (parameter_list) @params)) @isFunction
  (struct_specifier (type_identifier) @name) @isStruct
  (union_specifier (type_identifier) @name) @isStruct
  (enum_specifier (type_identifier) @name) @isEnum

  ;; --- Infrastructure (L3: Entry Points) ---
  (preproc_include
    path: [(string_literal) (system_lib_string)] @source) @isImport
  (preproc_def (identifier) @name) @isMacro
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (identifier) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression (identifier) @kinesis_target)
  
  (comment) @comment
`;
