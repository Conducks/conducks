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
  
  ;; Probed against tree-sitter-java (node-types.json + a live parse): method_declaration's return
  ;; type field is literally named `type` (not `return_type`), and both `type` and `parameters` are
  ;; REQUIRED — even `void` methods carry a void_type node there, so no `?` quantifier is needed.
  ;; formal_parameter's own `name` field matches reflector.ts's paramsOf() fallback directly — Java
  ;; is one of the languages that fallback chain was already written for.
  ;;
  ;; Field order in the pattern must follow the grammar's OWN field order (`type` before `name`), not
  ;; alphabetical — `name ... type` compiled but threw TSQueryErrorStructure at match time on this
  ;; grammar version (same finding as C#'s `returns`/`name` ordering, measured the same way).
  (method_declaration type: (_) @return_type name: (identifier) @name parameters: (formal_parameters) @params) @isFunction

  ;; CONSTRUCTORS. Named after their class, so they used to collapse onto the class's own id (the
  ;; reflector excluded every same-named enclosing scope) and overwrite its kind — and were dropped.
  ;; The reflector now excludes a same-named scope only when it WRAPS the declaration (ends where it
  ;; ends), so `Owner(…)` inside `class Owner` is `owner.owner`, a BEHAVIOR of the class.
  (constructor_declaration name: (identifier) @name parameters: (formal_parameters) @params) @isFunction

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
  ;; A GENERIC supertype — `extends TypeAdapter<T>`, `implements Codec<String>` — wraps the name in a
  ;; generic_type, and a record's interfaces were not read at all. MEASURED (Java oracle on gson,
  ;; 2026-11-12): SerializationDelegatingTypeAdapter, extended only as `…<T>`, was called ORPHAN.
  (class_declaration
    name: (identifier) @name
    superclass: (superclass (generic_type (type_identifier) @heritage_extends))) @isStruct
  (class_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (generic_type (type_identifier) @heritage_implements)))) @isStruct
  (interface_declaration
    name: (identifier) @name
    (extends_interfaces
      (type_list (generic_type (type_identifier) @heritage_extends)))) @isInterface
  (enum_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (generic_type (type_identifier) @heritage_implements)))) @isEnum
  (record_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (type_identifier) @heritage_implements))) @isStruct
  (record_declaration
    name: (identifier) @name
    interfaces: (super_interfaces
      (type_list (generic_type (type_identifier) @heritage_implements)))) @isStruct
  
  ;; --- Type positions (todo10 Phase 4) ---
  ;; Probed against tree-sitter-java 0.23.5 (node-types.json + a live parse, see docs/memory.md).
  ;; field/local-var/parameter/method all expose a `type:` field; generic args are reached the same
  ;; way TS reaches them — matched independent of parent, so nested generics resolve at every depth.
  ;; scoped_type_identifier (java.util.Optional) IS recursive in this grammar (unlike Rust's), so it
  ;; is anchored to a parent `type:`/argument slot rather than captured blanket — a blanket capture
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
  ;; A type NAMED in an expression, not a declaration (Java oracle, 2026-11-12). Each one is a use the
  ;; compiler requires: `Plugin.class`, the qualifier of a static call or field (`Strings.trimAll(…)`,
  ;; `Color.RED`) and of a method reference (`Strings::upper`). Without them a class reached only this
  ;; way was ORPHAN. A qualifier is only taken for a type when it is spelled like one (upper-case
  ;; first letter, Java's convention) — `repo.find()` names a variable, and a variable is not a type.
  (class_literal (type_identifier) @pulse_type_target)
  (method_invocation object: (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (field_access object: (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (method_reference . (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (method_reference . (type_identifier) @pulse_type_target)
  ;; …and the METHOD a reference names is called through it: `Strings::upper`, `this::go`,
  ;; `super::x`. The last identifier child (`Foo::new` has none — `new` is a keyword, and its type is
  ;; captured above). MEASURED (Java oracle, member verdicts): `Strings.upper`, used only as
  ;; `map(Strings::upper)`, was reported UNUSED_MEMBER.
  (method_reference (_) (identifier) @kinesis_target .)
  ;; Types the compiler requires in an expression or a clause, measured missing on the oracle
  ;; fixture (each one alone left its class ORPHAN): `x instanceof Marker`, `(Tagged) x`,
  ;; `catch (Boom e)`, `new Cell[2]`, and an array type `Cell[]` in any declaration.
  (instanceof_expression right: (type_identifier) @pulse_type_target)
  (instanceof_expression right: (generic_type (type_identifier) @pulse_type_target))
  (cast_expression type: (type_identifier) @pulse_type_target)
  (cast_expression type: (generic_type (type_identifier) @pulse_type_target))
  (catch_type (type_identifier) @pulse_type_target)
  (array_creation_expression type: (type_identifier) @pulse_type_target)
  (array_type element: (type_identifier) @pulse_type_target)
  (array_type element: (generic_type (type_identifier) @pulse_type_target))

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
  ;; A call on a NAMED receiver keeps the receiver — `owner.getName`, `this.owners.findAll` → `owners.findAll`
  ;; — so the linker can bind it through the receiver's declared type instead of by method name alone.
  ;; MEASURED (Java call oracle, gson): 1,061 calls bound to the wrong same-named method, e.g.
  ;; `adapter.fromJson(…)` to Gson.fromJson while `adapter` is declared a TypeAdapter.
  ;; Every other receiver (a chain, `new X()`, `super`, a literal) and an unqualified call keep the bare name.
  (method_invocation object: (identifier) @kinesis_object name: (identifier) @kinesis_target)
  (method_invocation object: (field_access object: (this) field: (identifier) @kinesis_object) name: (identifier) @kinesis_target)
  (method_invocation !object name: (identifier) @kinesis_target)
  (method_invocation object: [(method_invocation) (object_creation_expression) (field_access object: [(identifier) (field_access) (method_invocation) (super)]) (super) (this) (parenthesized_expression) (array_access) (string_literal) (cast_expression) (class_literal) (scoped_identifier)] name: (identifier) @kinesis_target)

  ;; Every identifier USED in the file: the reflector keeps those that name a field of this file and
  ;; turns them into ACCESSES edges (a field is read as `x` or `this.x`, never called).
  (identifier) @field_use

  ;; A declared variable's TYPE — local or field — read the way `const x = new Y()` is in TypeScript:
  ;; the type is written on the declaration. `var` states nothing and is skipped.
  (local_variable_declaration type: (type_identifier) @instance_type (#not-eq? @instance_type "var") declarator: (variable_declarator name: (identifier) @instance_name)) @isInstanceOf
  (local_variable_declaration type: (generic_type (type_identifier) @instance_type) declarator: (variable_declarator name: (identifier) @instance_name)) @isInstanceOf
  (field_declaration type: (type_identifier) @instance_type declarator: (variable_declarator name: (identifier) @instance_name)) @isInstanceOf
  (field_declaration type: (generic_type (type_identifier) @instance_type) declarator: (variable_declarator name: (identifier) @instance_name)) @isInstanceOf
  (object_creation_expression type: (type_identifier) @kinesis_target)
  ;; `new Box<>(…)` / `new Box<String>()`: the type is wrapped in a generic_type. MEASURED (gson):
  ;; TypeAdapterRuntimeTypeWrapper, built only by diamond in five files, was called ORPHAN.
  (object_creation_expression type: (generic_type (type_identifier) @kinesis_target))
  
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
