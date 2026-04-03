/**
 * Conducks — High-Fidelity Java SCM Query 🏺 🟦 (Omni-Detail)
 */
export const JAVA_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (variable_declarator name: (identifier) @name)) @isField
  (local_variable_declaration (variable_declarator name: (identifier) @name)) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (identifier) @name) @isStruct
  (record_declaration name: (identifier) @name) @isStruct
  (interface_declaration name: (identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isStruct
  
  (method_declaration name: (identifier) @name) @isFunction
  (constructor_declaration name: (identifier) @name) @isFunction
  
  (package_declaration (scoped_identifier) @name) @isPackage
  
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
