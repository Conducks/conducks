export const TYPESCRIPT_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  ;; Module-level Variables (Architectural Atoms)
  (program (lexical_declaration (variable_declarator name: (identifier) @name))) @isVariable
  (program (variable_declaration (variable_declarator name: (identifier) @name))) @isVariable
  (export_statement (lexical_declaration (variable_declarator name: (identifier) @name))) @isVariable

  ;; Class Properties (Stateful Atoms)
  (public_field_definition name: (property_identifier) @name) @isProperty

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (export_statement (class_declaration name: (type_identifier) @name (class_heritage [(extends_clause value: (_) @heritage) (implements_clause (_) @heritage)])? @heritage_clause) @isClass) @isExported
  (class_declaration name: (type_identifier) @name (class_heritage [(extends_clause value: (_) @heritage) (implements_clause (_) @heritage)])? @heritage_clause) @isClass

  (export_statement (interface_declaration name: (type_identifier) @name) @isInterface) @isExported
  (interface_declaration name: (type_identifier) @name) @isInterface
  

  (enum_declaration name: (identifier) @name) @isEnum
  (export_statement (function_declaration name: (identifier) @name) @isFunction) @isExported
  (function_declaration name: (identifier) @name) @isFunction
  
  ;; Anonymous/Expression functions
  (variable_declarator name: (identifier) @name value: (arrow_function)) @isFunction
  (variable_declarator name: (identifier) @name value: (function_expression)) @isFunction

  ;; Methods
  (method_definition name: (property_identifier) @name) @isMethod
  (public_field_definition name: (property_identifier) @name value: (arrow_function)) @isMethod

  ;; --- Infrastructure (L3: Entry Points & Routers) ---
  ;; Generic Route Heuristic: object.verb('/path', handler)
  (call_expression
    function: (member_expression
      property: (property_identifier) @route_method (#match? @route_method "^(get|post|put|delete|patch|use|all)$"))
    arguments: (arguments (string) @name . [(function_declaration) (arrow_function) (function_expression) (identifier)])) @isInfra

  ;; Decorator-based Infra (NestJS/TSOA)
  (decorator
    (call_expression
      function: (identifier) @decorator_name (#match? @decorator_name "^(Get|Post|Put|Delete|Patch|Controller|Authorized|Injectable|Tool|Action)$")
      arguments: (arguments (string)? @name))) @isInfra

  ;; --- Imports & Bindings ---
  (import_statement 
    "type"?
    (import_clause (named_imports (import_specifier name: (identifier) @name alias: (identifier)? @alias))*)*
    source: (string) @source) @isImport
  (import_statement "type"? (import_clause (namespace_import (identifier) @name)) source: (string) @source) @isImport
  (import_statement "type"? (import_clause (identifier) @name) source: (string) @source) @isImport

  ;; --- Kinetic Calls ---
  ;; do1() | new User()
  (call_expression function: (_) @kinesis_target arguments: (arguments (_) @kinesis_arg)*)
  
  ;; obj.method() | User.static()
  (call_expression function: (member_expression object: (_) @kinesis_object property: (property_identifier) @kinesis_target) arguments: (arguments (_) @kinesis_arg)*)

  ;; Constructor calls: new X()
  (new_expression constructor: (_) @kinesis_target arguments: (arguments (_) @kinesis_arg)*)

  ;; Qualified Constructor: new ns.X()
  (new_expression constructor: (member_expression object: (_) @kinesis_object property: (property_identifier) @kinesis_target))

  ;; --- Pulse Flow (Assignments) ---
  (variable_declarator name: (identifier) @pulse_assignment_name value: (_) @pulse_assignment_value)
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; --- Type Captures ---
  (type_identifier) @pulse_type_target

  ;; --- Debt Markers ---
  (comment) @comment
`;
