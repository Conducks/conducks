/**
 * Conducks — High-Fidelity Python SCM Query (Suite v3) 🏺 🟦 🐍
 * 
 * Captures Imports, Decorators, Type Hints, and Kinetic Flow.
 */
export const PYTHON_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (import_statement (dotted_name) @name) @isImport
  (import_from_statement 
    module_name: [(dotted_name) (relative_import)] @name
    name: [
      (dotted_name) @named_import
      (aliased_import (dotted_name) @named_import (identifier) @metadata)
      (wildcard_import) @metadata
    ]) @isImport

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_definition name: (identifier) @name) @isStruct
  (function_definition name: (identifier) @name) @isFunction
  
  ;; Heritage: class Child(Parent):
  (class_definition 
    superclasses: (argument_list [(identifier) (attribute)] @heritage))
  
  ;; --- Infrastructure (L4: Entry Points & Metadata) ---
  (decorator
    [(call
        function: [(identifier) (attribute)] @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route|task|job|consume|produce|subscribe|publish)$")
        arguments: (argument_list (string) @kinesis_route_path))
     (identifier) @infra_method (#match? @infra_method "^(classmethod|staticmethod|property|abstractmethod|wrapper|wraps|cached_property|lru_cache|retry)$")
     (attribute attribute: (identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route)$"))]) @isInfra

  ;; --- Atoms (L7: State & Persistence) ---
  ;; typed_parameter: x: str
  (typed_parameter (identifier) @name (_) @metadata) @isVariable
  (typed_default_parameter (identifier) @name (_) @metadata) @isVariable

  ;; assignment: self.x = 10
  (assignment
    left: [
      (identifier) @name
      (attribute (identifier) (identifier) @name)
      (expression_list (attribute (identifier) (identifier) @name))
    ]) @isVariable

  ;; --- Pulse Flow (Assignments) ---
  (assignment
    left: [
      (identifier) @pulse_assignment_name
      (attribute (identifier) (identifier) @pulse_assignment_name)
    ]
    right: (_) @pulse_assignment_value)

  ;; --- Kinetic Flow (L6: Behavior & Logic) ---
  (call 
    function: [(identifier) (attribute)] @kinesis_target
    arguments: (argument_list (_) @kinesis_arg))
  (raise_statement) @isKinetic
  (try_statement) @isKinetic
  (assert_statement) @isKinetic
  (global_statement (identifier) @name) @isKinetic
  (nonlocal_statement (identifier) @name) @isKinetic

  ;; --- Async Transitions ---
  ((function_definition) @isAsync (#match? @isAsync "^async"))
  (await) @isAsync

  ;; --- Metadata & Debt ---
  (expression_statement (string) @docs) ; Docstrings
  (comment) @docs
`;
