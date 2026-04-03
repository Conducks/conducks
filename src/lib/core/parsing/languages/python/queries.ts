/**
 * Conducks — High-Fidelity Python SCM Query 🏺 🟦 (Omni-Detail)
 * 
 * Captures Decorators, Type Hints, and Class Heritage.
 */
export const PYTHON_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  ;; Variables with Type Hints: x: str = "..."
  (typed_parameter (identifier) @name (_) @metadata) @isVariable
  (typed_default_parameter (identifier) @name (_) @metadata) @isVariable
  
  (assignment
    (expression_list (attribute (identifier) (identifier) @name)) @isVariable)
  (attribute (identifier) (identifier) @name) @isProperty
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_definition name: (identifier) @name) @isStruct
  (function_definition name: (identifier) @name) @isFunction
  
  ;; Heritage: class Child(Parent):
  (class_definition 
    superclasses: (argument_list (identifier) @heritage))
  
  ;; --- Infrastructure (L3-L4: Entry Points) ---
  ;; Decorators: @app.get('/'), @classmethod
  (decorator
    [(call
        function: [(identifier) (attribute)] @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route)$")
        arguments: (argument_list (string) @kinesis_route_path))
     (identifier) @infra_method (#match? @infra_method "^(classmethod|staticmethod|property|abstractmethod|wrapper|wraps)$")
     (attribute attribute: (identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route)$"))]) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (call function: [(identifier) (attribute)] @kinesis_target)
  
  ;; --- Metadata & Debt ---
  (expression_statement (string) @docs) ; Docstrings
  (comment) @docs
`;
