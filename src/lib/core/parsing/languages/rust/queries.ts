/**
 * Conducks — High-Fidelity Rust SCM Query 🏺 🟦 (Omni-Detail)
 */
export const RUST_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (use_declaration
    argument: (scoped_identifier
      path: (_) @source)) @isImport
  (use_declaration
    argument: (identifier) @source) @isImport
  (use_declaration
    argument: (scoped_use_list
      path: (_) @source)) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (let_declaration pattern: (identifier) @name) @isVariable
  (const_item name: (identifier) @name) @isVariable
  (static_item name: (identifier) @name) @isVariable
  (field_declaration name: (field_identifier) @name) @isProperty
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (function_item name: (identifier) @name) @isFunction
  (struct_item name: (type_identifier) @name) @isStruct
  (enum_item name: (type_identifier) @name) @isEnum
  (union_item name: (type_identifier) @name) @isStruct
  (trait_item name: (type_identifier) @name) @isInterface
  
  ;; Modules
  (mod_item name: (identifier) @name) @isPackage
  
  ;; Lifetime parameters
  (lifetime) @isProperty

  ;; Generic type parameters with bounds
  (type_parameters
    (type_parameter) @isProperty)

  ;; Trait implementations (creates IMPLEMENTS edge conceptually)
  (impl_item
    trait: (_) @source
    type: (_) @isHeritage) @isInfra

  ;; Implementation Blocks
  (impl_item type: (type_identifier) @heritage)

  ;; Methods inside impl blocks
  (impl_item
    body: (declaration_list
      (function_item name: (identifier) @name) @isMethod))
  
  ;; --- Type positions (todo10 Phase 4) ---
  ;; Probed against tree-sitter-rust 0.24.0 (node-types.json + a live parse, see docs/memory.md).
  ;; Every real type position (field, parameter, let-binding, return type, const/static) exposes a
  ;; \`type:\` (or \`return_type:\`) field, so each is anchored to its own node instead of a blanket
  ;; (type_identifier) capture — a blanket capture would also fire on the struct/trait/enum's OWN
  ;; name node (also a type_identifier), producing a self-referencing edge. generic_type's name and
  ;; type_arguments' members are matched independent of the parent that holds them, so Vec<HashMap
  ;; <K, Box<V>>> resolves at every nesting depth via the same two rules.
  (field_declaration type: (type_identifier) @pulse_type_target)
  (field_declaration type: (reference_type type: (type_identifier) @pulse_type_target))
  (parameter type: (type_identifier) @pulse_type_target)
  (parameter type: (reference_type type: (type_identifier) @pulse_type_target))
  (let_declaration type: (type_identifier) @pulse_type_target)
  (let_declaration type: (reference_type type: (type_identifier) @pulse_type_target))
  (function_item return_type: (type_identifier) @pulse_type_target)
  (const_item type: (type_identifier) @pulse_type_target)
  (static_item type: (type_identifier) @pulse_type_target)
  (pointer_type type: (type_identifier) @pulse_type_target)
  (generic_type type: (type_identifier) @pulse_type_target)
  (type_arguments (type_identifier) @pulse_type_target)
  ;; Trait bounds: fn f<T: Clone + Shape>(...) — each bound is a real type dependency.
  (trait_bounds (type_identifier) @pulse_type_target)
  ;; dyn Trait: Box<dyn Shape>
  (dynamic_type trait: (type_identifier) @pulse_type_target)
  ;; Scoped type paths (std::fmt::Result) are their own node and NOT recursive the way Java's
  ;; scoped_type_identifier is — a blanket capture here does not double-count the partial prefix.
  (scoped_type_identifier) @pulse_type_target

  ;; --- Infrastructure (L3: Entry Points) ---
  ;; Route Attributes: #[get("/")]
  (attribute_item
    (attribute
      (identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route)$")
      (token_tree (string_literal) @kinesis_route_path))) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression function: [(identifier) (field_identifier) (scoped_identifier)] @kinesis_target)
  
  ;; --- Debt Markers ---
  [(line_comment) (block_comment)] @comment

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; The RECEIVER is captured as well as the URL, because flow.ts uses it as the evidence that a
  ;; call is a network call — without it, a config lookup and an HTTP GET are the same shape.

  ;; client.get(url) — reqwest and friends
  (call_expression
    function: (field_expression
      value: (identifier) @kinesis_object
        (#match? @kinesis_object "^(client|http|reqwest|agent)$")
      field: (field_identifier) @req_method
        (#match? @req_method "^(get|post|put|patch|delete|head|request|send)$"))
    arguments: (arguments . (string_literal) @kinesis_request_url)) @kinesis_request
`;
