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
`;
