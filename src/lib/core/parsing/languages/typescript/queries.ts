/**
 * Conducks — High-Fidelity TypeScript SCM Query 🏺 🟦 (Omni-Detail)
 * 
 * Captures Decorators, Interfaces, Type Aliases, and Heritage.
 */
export const TYPESCRIPT_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture: each named import specifier gets its own match with @name
  (import_statement
    (import_clause (named_imports (import_specifier name: (identifier) @name)))
    source: (string) @source) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  (variable_declarator name: (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  (interface_declaration name: (type_identifier) @name) @isInterface
  (type_alias_declaration name: (type_identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isEnum
  
  (function_declaration name: (identifier) @name) @isFunction
  (method_definition name: (_) @name) @isMethod
  
  ;; Heritage: extends/implements
  (class_heritage (extends_clause (_) @heritage))
  (class_heritage (implements_clause (_) @heritage))
  (extends_type_clause (_) @heritage)

  ;; --- Type positions (ADR 0016) ---
  ;; A symbol used only here is erased by the compiler, so its import is not runtime coupling.
  ;; Without these captures the graph has no type-usage evidence at all and cannot tell a
  ;; type-only import from a real one.
  (type_annotation (type_identifier) @pulse_type_target)
  (type_annotation (generic_type name: (type_identifier) @pulse_type_target))
  (type_arguments (type_identifier) @pulse_type_target)
  
  ;; --- Infrastructure (L3-L4: Entry Points) ---
  ;; Decorators: @Controller('/path'), @Get('/path')
  (decorator
    [(call_expression 
        function: (identifier) @infra_method (#match? @infra_method "^(Controller|Get|Post|Put|Delete|Patch|Injectable|Inject|Entity)$")
        arguments: (arguments (string) @kinesis_route_path))
     (identifier) @infra_method (#match? @infra_method "^(Injectable|Inject|Entity)$")]) @isInfra
  
  ;; React Hooks: const [x, setX] = useState()
  (variable_declarator
    name: (array_pattern (identifier) @pulse_assignment_name)
    value: (call_expression function: (identifier) @infra_method (#match? @infra_method "^use.*$"))) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; --- Reference-as-value in object literals: { key: someSymbol } (DI tables, command maps) ---
  ;; The value identifier is a USE of that symbol, not a call. Feeds the reference-as-value path.
  (pair value: (identifier) @ref_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression 
    function: [(identifier) (member_expression) (super)] @kinesis_target
    arguments: (arguments (_)* @kinesis_arg))
  (new_expression 
    constructor: (identifier) @kinesis_target
    arguments: (arguments (_)* @kinesis_arg))
  
  ;; --- Modifiers (DNA flags) ---
  (export_statement (function_declaration name: (identifier) @name) @isExported) @isFunction
  (export_statement (class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)) @isExported) @isVariable
  (function_declaration "async" name: (identifier) @name) @isAsync @isFunction
  (abstract_method_signature name: (_) @name) @isAbstract @isMethod

  ;; --- Metadata & Debt ---
  (comment) @comment
`;
