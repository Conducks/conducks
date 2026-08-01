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
  ;; heritage captures co-resolve a definition node (reflector.ts:438); the _extends/_implements
  ;; suffix carries the clause so the processor does not fall back to the name heuristic.
  ;; grammar 0.23: the superclass field holds a (superclass) wrapper, not a bare type_identifier
  (class_declaration
    name: (identifier) @name
    superclass: (superclass (type_identifier) @heritage_extends)) @isStruct
  (class_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (type_identifier) @heritage_implements))) @isStruct
  (interface_declaration
    name: (identifier) @name
    (extends_interfaces
      (type_list (type_identifier) @heritage_extends))) @isInterface
  (enum_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (type_identifier) @heritage_implements))) @isEnum
  
  ;; --- Type positions (todo10 Phase 4) ---
  ;; Probed against tree-sitter-java 0.23.5 (node-types.json + a live parse, see docs/memory.md).
  ;; field/local-var/parameter/method all expose a \`type:\` field; generic args are reached the same
  ;; way TS reaches them — matched independent of parent, so nested generics resolve at every depth.
  ;; scoped_type_identifier (java.util.Optional) IS recursive in this grammar (unlike Rust's), so it
  ;; is anchored to a parent \`type:\`/argument slot rather than captured blanket — a blanket capture
  ;; would double-emit the partial prefix (e.g. both "java.util.Optional" AND "java.util") as
  ;; separate targets for the same reference.
  (field_declaration type: (type_identifier) @pulse_type_target)
  (field_declaration type: (generic_type (type_identifier) @pulse_type_target))
  (field_declaration type: (generic_type (scoped_type_identifier) @pulse_type_target))
  (field_declaration type: (scoped_type_identifier) @pulse_type_target)
  (local_variable_declaration type: (type_identifier) @pulse_type_target)
  (local_variable_declaration type: (generic_type (type_identifier) @pulse_type_target))
  (local_variable_declaration type: (generic_type (scoped_type_identifier) @pulse_type_target))
  (formal_parameter type: (type_identifier) @pulse_type_target)
  (formal_parameter type: (generic_type (type_identifier) @pulse_type_target))
  (method_declaration type: (type_identifier) @pulse_type_target)
  (method_declaration type: (generic_type (type_identifier) @pulse_type_target))
  (type_arguments (type_identifier) @pulse_type_target)
  (type_arguments (generic_type (type_identifier) @pulse_type_target))
  (type_arguments (scoped_type_identifier) @pulse_type_target)
  ;; Generic bounds: class Repo<T extends Comparable<T>>
  (type_bound (type_identifier) @pulse_type_target)
  (type_bound (generic_type (type_identifier) @pulse_type_target))
  ;; checked exceptions: throws java.io.IOException
  (throws (type_identifier) @pulse_type_target)
  (throws (scoped_type_identifier) @pulse_type_target)

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

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; The RECEIVER is captured as well as the URL, because flow.ts uses it as the evidence that a
  ;; call is a network call — without it, a config lookup and an HTTP GET are the same shape.

  ;; restTemplate.getForObject(url) · httpClient.send(...) · client.get(url)
  (method_invocation
    object: (identifier) @kinesis_object
      (#match? @kinesis_object "^(restTemplate|httpClient|client|http|webClient|okHttpClient)$")
    name: (identifier) @req_method
      (#match? @req_method "^(get|post|put|patch|delete|head|exchange|send|execute|getForObject|getForEntity|postForObject|postForEntity)$")
    arguments: (argument_list . (string_literal) @kinesis_request_url)) @kinesis_request
`;
