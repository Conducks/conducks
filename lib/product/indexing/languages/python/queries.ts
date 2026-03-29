/**
 * Apostle — High-Fidelity Python SCM Query 💎 ( Parity)
 */
export const PYTHON_QUERIES = `
  (class_definition name: (identifier) @name) @isClass
  (function_definition name: (identifier) @name) @isFunction
  (decorated_definition (class_definition name: (identifier) @name)) @isClass
  (decorated_definition (function_definition name: (identifier) @name)) @isFunction
  
  (import_statement name: (dotted_name) @source) @isImport
  (import_from_statement module_name: (dotted_name) @source) @isImport
  (import_from_statement module_name: (relative_import) @source) @isImport
  
  (aliased_import name: (dotted_name) @name alias: (identifier) @alias) @isBinding
  
  ;; Simple function call: do1()
  (call function: (identifier) @kinesis_target arguments: (argument_list (_) @kinesis_arg)*)
  ;; Attribute call: hub.main()
  (call function: (attribute) @kinesis_qualified_target arguments: (argument_list (_) @kinesis_arg)*)


  ;; ── Phase 2: Pulse Flow & Intelligence ──
  
  ;; Assignments (Variable Handover)
  (assignment left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  (augmented_assignment left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; HTTP Route Definitions (API Endpoints)
  (decorator 
    (call 
      function: (attribute object: (identifier) @route_receiver attribute: (identifier) @route_method)
      arguments: (argument_list (string (string_content) @kinesis_route_path)))) @kinesis_route

  ;; HTTP Client Requests (Outgoing)
  (call
    function: (attribute object: (identifier) @req_receiver attribute: (identifier) @req_method)
    arguments: (argument_list (string (string_content) @kinesis_request_url))) @kinesis_request

  ;; Heritage
  (class_definition name: (identifier) @name
    (argument_list (identifier) @heritage)) @isClass
`;

