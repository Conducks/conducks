/**
 * Conducks — High-Fidelity Java SCM Query 🏺 🟦 (Omni-Detail)
 */
export const JAVA_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (import_declaration
    (scoped_identifier) @source) @isImport
  (import_declaration
    (identifier) @source) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (variable_declarator name: (identifier) @name)) @isField
  (local_variable_declaration (variable_declarator name: (identifier) @name)) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (identifier) @name) @isStruct
  (record_declaration name: (identifier) @name) @isStruct
  (interface_declaration name: (identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isEnum
  
  (method_declaration name: (identifier) @name) @isFunction
  (constructor_declaration name: (identifier) @name) @isFunction
  
  (package_declaration (scoped_identifier) @name) @isPackage

  ;; Heritage: extends / implements
  (class_declaration
    superclass: (type_identifier) @heritage)
  (class_declaration
    interfaces: (super_interfaces
      (type_list (type_identifier) @heritage)))
  (interface_declaration
    (extends_interfaces
      (type_list (type_identifier) @heritage)))
  (enum_declaration
    (super_interfaces
      (type_list (type_identifier) @heritage)))
  
  ;; --- Infrastructure (L3: Entry Points) ---
  ;; Spring Boot / JAX-RS Route Annotations: @GetMapping("/")
  (annotation
    name: (identifier) @infra_method (#match? @infra_method "^(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping|Path)$")
    arguments: (annotation_argument_list (string_literal) @kinesis_route_path)) @isInfra

  ;; Dependency Injection
  (annotation
    name: (identifier) @infra_method (#match? @infra_method "^(Autowired|Inject|Resource|Service|Component|Repository|Controller|RestController)$")) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (method_invocation name: (identifier) @kinesis_target)
  (object_creation_expression type: (type_identifier) @kinesis_target)
  
  ;; --- Debt Markers ---
  [(line_comment) (block_comment)] @comment
`;
