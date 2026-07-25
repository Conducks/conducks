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

  ;; DROPPED: (constructor_declaration name: (identifier) @name) @isFunction
  ;; In Java the constructor's name IS the class name, and the reflector's scoped id excludes a
  ;; same-named enclosing scope — so the constructor and its class collapse onto the SAME node id
  ;; and the constructor's @isFunction overwrote the class kind (struct -> function). Losing the
  ;; class as a STRUCTURE is worse than losing the constructor, so the constructor is not extracted.
  ;; Re-add only once the reflector can disambiguate a constructor from its owning type.

  (package_declaration (scoped_identifier) @name) @isPackage

  ;; Heritage: extends / implements
  ;; The subject @name is captured in the SAME pattern on purpose — the reflector only processes a
  ;; @heritage capture when the match also resolves a definition node (reflector.ts:438).
  ;; grammar 0.23: the superclass field holds a (superclass) wrapper, not a bare type_identifier
  (class_declaration
    name: (identifier) @name
    superclass: (superclass (type_identifier) @heritage)) @isStruct
  (class_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (type_identifier) @heritage))) @isStruct
  (interface_declaration
    name: (identifier) @name
    (extends_interfaces
      (type_list (type_identifier) @heritage))) @isInterface
  (enum_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (type_identifier) @heritage))) @isEnum
  
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
