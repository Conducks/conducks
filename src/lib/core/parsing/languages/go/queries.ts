/**
 * Conducks — High-Fidelity Go SCM Query 🏺 🟦 (Omni-Detail)
 */
export const GO_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  ;; Package-level Variables and Constants
  (var_declaration (var_spec name: (identifier) @name)) @isVariable
  (const_declaration (const_spec name: (identifier) @name)) @isVariable
  
  ;; Struct Fields (Stateful Atoms)
  (field_declaration name: (field_identifier) @name) @isProperty

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (function_declaration name: (identifier) @name) @isFunction
  (package_clause (package_identifier) @name) @isPackage

  ;; Modern Genetics (Go 1.18+)
  (type_parameter_list (parameter_declaration name: (identifier) @name)) @isGeneric
  (type_parameter_list (parameter_declaration) @generic_param)

  ;; Methods with Receivers
  (method_declaration 
    receiver: (parameter_list (parameter_declaration type: (pointer_type [(type_identifier) (generic_type)] @receiver_type))) 
    name: (field_identifier) @name) @isMethod
  
  (method_declaration 
    receiver: (parameter_list (parameter_declaration type: [(type_identifier) (generic_type)] @receiver_type)) 
    name: (field_identifier) @name) @isMethod

  ;; Structs and Interfaces
  (type_spec name: (type_identifier) @name type: (struct_type)) @isStruct
  (type_spec name: (type_identifier) @name type: (interface_type)) @isInterface

  ;; --- Infrastructure (L3: Entry Points & Routers) ---
  ;; HTTP Handlers: http.HandleFunc("/path", handler)
  (call_expression
    function: (selector_expression
      operand: (identifier) @infra_operand (#match? @infra_operand "^(http|mux|router|r|api|app|gin|echo|fiber)$")
    field: (field_identifier) @infra_method (#match? @infra_method "^(HandleFunc|Handle|GET|POST|PUT|DELETE|PATCH|Use|Group)$"))
    arguments: (argument_list [(interpreted_string_literal) (raw_string_literal)] @kinesis_route_path . [(identifier) (func_literal)])) @isInfra

  ;; gRPC Service Registration
  (call_expression
    function: (identifier) @infra_method (#match? @infra_method "^Register.*Server$")
    arguments: (argument_list (_) @kinesis_arg)*) @isInfra

  ;; --- Pulse Flow (Assignments & Data Handover) ---
  ;; short_var_declaration :=
  (short_var_declaration 
    left: (expression_list (identifier) @pulse_assignment_name) 
    right: (expression_list (_) @pulse_assignment_value)) @isPulse
    
  ;; standard assignment =
  (assignment_statement 
    left: (expression_list (identifier) @pulse_assignment_name) 
    right: (expression_list (_) @pulse_assignment_value)) @isPulse

  ;; Keyed Elements (Ultra-Stable Baseline)
  ((_) @pulse_node 
    (#match? @pulse_node "^keyed_element$") 
    (_) @pulse_assignment_name) @isPulse

  ;; Channel Sync (Send/Receive as Pulse)
  (send_statement channel: (identifier) @pulse_assignment_name value: (_) @pulse_assignment_value) @isPulse
  (unary_expression operator: "<-" operand: (identifier) @pulse_assignment_value) @isPulse

  ;; --- Behavioral Boundaries (L5: Guards) ---
  ;; Error Guard: if err != nil
  (if_statement 
    condition: (binary_expression 
      left: (identifier) @name (#match? @name "^(err|error)$")
      operator: "!="
      right: (nil)) @isGuard)

  ;; Type Switches
  (type_switch_statement 
    (expression_list (identifier) @pulse_assignment_name)? 
    value: (type_assertion_expression) @pulse_assignment_value) @isGuard

  ;; --- Behavioral Contracts (L5 Intent) ---
  ;; var _ Interface = (*Struct)(nil)
  (var_declaration 
    (var_spec 
      (_) @contract_blank (#eq? @contract_blank "_")
      type: (type_identifier) @contract_interface 
      value: (expression_list (_) @contract_value))) @isContract

  ;; --- Heritage (Embellished DNA) ---
  ;; Interface Methods (L5)
  (method_spec name: (field_identifier) @name) @isMethod

  ;; Embedded Structs (L4 Inheritance)
  (field_declaration type: [(type_identifier) (pointer_type) (slice_type) (map_type) (call_expression)] @heritage)

  ;; --- Execution Logic ---
  (go_statement (call_expression function: [(identifier) (selector_expression)] @kinesis_target)) @isConcurrent
  (defer_statement (call_expression function: [(identifier) (selector_expression)] @kinesis_target)) @isDeferred
  (call_expression function: [(identifier) (selector_expression)] @kinesis_target)

  ;; Variadic DNA
  (variadic_parameter_declaration) @isVariadic

  ;; Structural Labeled Flow
  (labeled_statement label: (label_name) @name) @isFlow

  ;; --- Global Resonance (Type Capture) ---
  (type_identifier) @pulse_type_target
  (type_assertion_expression type: (type_identifier) @pulse_type_target)
  (type_parameter_list (parameter_declaration (type_identifier) @pulse_type_target))

  ;; --- Imports & Aliases ---
  (import_spec name: (package_identifier) @alias path: [(interpreted_string_literal) (raw_string_literal)] @source) @isBinding
  (import_spec path: [(interpreted_string_literal) (raw_string_literal)] @source) @isImport

  ;; --- Debt Markers ---
  (comment) @comment
`;
