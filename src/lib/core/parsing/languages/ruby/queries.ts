/**
 * Conducks — High-Fidelity Ruby SCM Query 🏺 🟦 (Omni-Detail)
 */
export const RUBY_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (call
    method: (identifier) @_req (#match? @_req "^require(_relative)?$")
    arguments: (argument_list (string) @source)) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (assignment left: (identifier) @name) @isVariable
  (instance_variable) @isProperty
  (class_variable) @isProperty
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class name: (constant) @name) @isStruct
  (module name: (constant) @name) @isStruct
  (method name: (identifier) @name) @isFunction
  (singleton_method name: (identifier) @name) @isMethod
  
  ;; --- Infrastructure (L3: Entry Points) ---
  ;; Rails Resources: resources :users
  (call
    method: (identifier) @infra_method (#match? @infra_method "^(resources|resource|get|post|put|patch|delete|root)$")
    arguments: (argument_list (_) @kinesis_route_path)) @isInfra

  ;; Module Mixins: include, extend, prepend
  (call
    method: (identifier) @heritage_method (#match? @heritage_method "^(include|extend|prepend)$")
    arguments: (argument_list (constant) @heritage)) @isHeritage
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (call method: (identifier) @kinesis_target)
  
  ;; --- Metaprogramming: attr_accessor / attr_reader / attr_writer ---
  (call
    method: (identifier) @source
    (#match? @source "^attr_(accessor|reader|writer)$")
    arguments: (argument_list)) @isProperty

  ;; --- Rails DSL: belongs_to, has_many, validates, before_action etc. ---
  (call
    method: (identifier) @source
    (#match? @source "^(belongs_to|has_many|has_one|has_and_belongs_to_many|validates|validates_presence_of|scope|before_action|after_action|before_filter|callback)$")) @isInfra

  ;; --- Dynamic Method Definition (define_method) ---
  (call
    method: (identifier) @source
    (#eq? @source "define_method")
    arguments: (argument_list (_) @isMethod)) @isMethod

  ;; --- Debt Markers ---
  (comment) @comment
`;
