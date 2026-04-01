export const TYPESCRIPT_QUERIES = `
  ;; --- Definitions ---
  (class_declaration name: (type_identifier) @name) @isClass
  (interface_declaration name: (type_identifier) @name) @isInterface
  

  (enum_declaration name: (identifier) @name) @isEnum
  (function_declaration name: (identifier) @name) @isFunction
  
  ;; Anonymous/Expression functions
  (variable_declarator name: (identifier) @name value: (arrow_function)) @isFunction
  (variable_declarator name: (identifier) @name value: (function_expression)) @isFunction

  ;; Methods
  (method_definition name: (property_identifier) @name) @isMethod
  (public_field_definition name: (property_identifier) @name value: (arrow_function)) @isMethod

  ;; --- Imports & Bindings ---
  (import_statement 
    "type"?
    (import_clause (named_imports (import_specifier name: (identifier) @name alias: (identifier)? @alias))*)*
    source: (string) @source) @isImport
  (import_statement "type"? (import_clause (namespace_import (identifier) @name)) source: (string) @source) @isImport
  (import_statement "type"? (import_clause (identifier) @name) source: (string) @source) @isImport

  ;; --- Kinetic Calls ---
  ;; do1()
  (call_expression function: (identifier) @kinesis_target arguments: (arguments (_) @kinesis_arg)*)
  ;; obj.method()
  (call_expression function: (member_expression property: (property_identifier) @kinesis_target) arguments: (arguments (_) @kinesis_arg)*)
  ;; Constructor calls: new X()
  (new_expression constructor: (identifier) @kinesis_target arguments: (arguments (_) @kinesis_arg)*)

  ;; --- Phase 2.1: Logical Entry Points (Express/Fastify/Nest) ---
  ;; app.get('/path', handler)
  (call_expression
    function: (member_expression
      object: (identifier) @req_receiver
      property: (property_identifier) @route_method (#match? @route_method "^(get|post|put|delete|patch|use|all)$"))
    arguments: (arguments (string) @kinesis_route_path . (_) @kinesis_route))

  ;; router.get('/path', handler)
  (call_expression
    function: (member_expression
      object: (identifier) @req_receiver (#match? @req_receiver "^(router|route|api)$")
      property: (property_identifier) @route_method (#match? @route_method "^(get|post|put|delete|patch)$"))
    arguments: (arguments (string) @kinesis_route_path . (_) @kinesis_route))

  ;; Decorators: @Get('/path')
  (decorator
    (call_expression
      function: (identifier) @decorator_name (#match? @decorator_name "^(Get|Post|Put|Delete|Patch|Controller|Authorized)$")
      arguments: (arguments (string)? @kinesis_route_path))) @kinesis_route

  ;; --- Pulse Flow (Assignments) ---
  (variable_declarator name: (identifier) @pulse_assignment_name value: (_) @pulse_assignment_value)
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; --- Type Captures (Phase 3.5: GVR High-Fidelity) ---
  (type_identifier) @pulse_type_target

  ;; --- Phase 3.2: Debt Markers ---
  (comment) @comment
`;
