/**
 * Conducks — High-Fidelity TypeScript SCM Query 🏺 🟦 (Omni-Detail)
 * 
 * Captures Decorators, Interfaces, Type Aliases, and Heritage.
 */
export const TYPESCRIPT_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement (string) @source) @isImport
  (export_statement (string) @source) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  (variable_declarator name: (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  (interface_declaration name: (type_identifier) @name) @isInterface
  (type_alias_declaration name: (type_identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isStruct
  
  (function_declaration name: (identifier) @name) @isFunction
  (method_definition name: (property_identifier) @name) @isMethod
  
  ;; Heritage: extends/implements
  (class_heritage (extends_clause (_) @heritage))
  (class_heritage (implements_clause (_) @heritage))
  (extends_type_clause (_) @heritage)
  
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
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression 
    function: [(identifier) (member_expression) (super)] @kinesis_target
    arguments: (arguments (_) @kinesis_arg))
  (new_expression 
    constructor: (identifier) @kinesis_target
    arguments: (arguments (_) @kinesis_arg))
  
  ;; --- Metadata & Debt ---
  (comment) @docs
`;
