/**
 * Conducks — High-Fidelity Ruby SCM Query 🏺 🟦 (Omni-Detail)
 */
export const RUBY_QUERIES = `
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
  (call method: (identifier) @kinesis_target)
  
  ;; --- Debt Markers ---
  (comment) @comment
`;
