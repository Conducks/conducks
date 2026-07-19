/**
 * Conducks — High-Fidelity JavaScript SCM Query 🏺 🟨 (Omni-Detail)
 *
 * JavaScript-only variant: no TS-specific nodes (interface, type alias, declare,
 * type parameters, abstract classes, decorators). Adds CommonJS require() support.
 */
export const JAVASCRIPT_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture
  (import_statement
    (import_clause (named_imports (import_specifier name: (identifier) @name)))
    source: (string) @source) @isImport

  ;; --- CommonJS require() ---
  (variable_declarator
    name: (identifier) @name
    value: (call_expression
      function: (identifier) @_req (#eq? @_req "require")
      arguments: (arguments (string) @source))) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  (variable_declarator name: (identifier) @name) @isVariable

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (identifier) @name) @isStruct

  (function_declaration name: (identifier) @name) @isFunction
  (method_definition name: (_) @name) @isMethod

  ;; Heritage: extends
  (class_heritage (extends_clause (_) @heritage))

  ;; --- React Hooks: const [x, setX] = useState() ---
  (variable_declarator
    name: (array_pattern (identifier) @pulse_assignment_name)
    value: (call_expression function: (identifier) @infra_method (#match? @infra_method "^use.*$"))) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; Reference-as-value in object literals: { key: someSymbol } (DI tables, command maps)
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
  (export_statement (class_declaration name: (identifier) @name) @isExported) @isStruct
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)) @isExported) @isVariable
  (function_declaration "async" name: (identifier) @name) @isAsync @isFunction

  ;; --- Metadata & Debt ---
  (comment) @comment
`;
