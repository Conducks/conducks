/**
 * Conducks — High-Fidelity PHP SCM Query 🏺 🟦 (Omni-Detail)
 */
export const PHP_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (namespace_use_declaration
    (namespace_use_clause
      (qualified_name) @source)) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  ;; tree-sitter-php 0.24: the variable sits under (property_element name: (variable_name)),
  ;; never directly under (property_declaration).
  (property_declaration (property_element name: (variable_name) @name)) @isProperty
  (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration (name) @name) @isStruct
  (interface_declaration (name) @name) @isInterface
  (trait_declaration (name) @name) @isStruct
  (enum_declaration (name) @name) @isEnum
  
  ;; --- Signature (ADR 0086/0087): parameters and declared return type. ---
  ;; 'parameters' and 'return_type' are both real fields on tree-sitter-php 0.24's
  ;; function_definition / method_declaration; 'parameters' is always present (even "()"),
  ;; 'return_type' only when written, so it is wrapped optional. return_type is captured as a
  ;; wildcard (_) rather than a specific node type: PHP writes it as a bare primitive_type
  ;; ("int", "void"), a named_type (class name), a nullable_type ("?Foo") or a union_type
  ;; ("Foo|Bar"), and a single field position covers all of them without four separate patterns.
  ;;
  ;; KNOWN GAP, reported rather than fixed (reflector.ts's paramsOf is frozen): a by-reference
  ;; parameter (&$c) and a variadic parameter (...$rest) both carry a 'name' field pointing at the
  ;; variable_name node ("$c" / "$rest"), which does NOT include the & or ... prefix — the
  ;; reference_modifier / "..." token is a SIBLING, not part of the name field's own text. So
  ;; paramsOf's pattern-then-name fallback picks 'name' and the marker is LOST. See
  ;; agent-dynamic.md handover for the measured values.
  (function_definition (name) @name parameters: (formal_parameters) @params return_type: (_)? @return_type) @isFunction
  (method_declaration (name) @name parameters: (formal_parameters) @params return_type: (_)? @return_type) @isMethod
  
  (namespace_definition (namespace_name) @name) @isNamespace
  
  ;; --- Infrastructure (L3: Entry Points) ---
  ;; Laravel / Symfony Route Attributes: #[Get('/')]
  (attribute
    (name) @infra_method (#match? @infra_method "^(Get|Post|Put|Delete|Patch|Route)$")
    (_) @kinesis_route_path) @isInfra

  ;; gRPC / Protobuf
  (function_call_expression
    (name) @infra_method (#match? @infra_method "^register.*$")) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (function_call_expression [(name) (relative_name) (member_call_expression) (qualified_name)] @kinesis_target)
  (member_call_expression (name) @kinesis_target)
  
  ;; --- Namespace Alias (use A\B as C) ---
  ;; tree-sitter-php 0.24 flattened the old (namespace_aliasing_clause) into an "alias:" field.
  (namespace_use_clause
    [(qualified_name) (name)] @source
    alias: (name) @isBinding) @isImport

  ;; --- Trait Conflict Resolution (insteadof) ---
  ;; "T1::hi insteadof T2" — the left side is a (class_constant_access_expression), not a bare (name).
  (use_instead_of_clause
    (class_constant_access_expression . (name) @isHeritage)
    (name) @source) @isInfra

  ;; --- Debt Markers ---
  (comment) @comment

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; The RECEIVER is captured as well as the URL, because flow.ts uses it as the evidence that a
  ;; call is a network call — without it, a config lookup and an HTTP GET are the same shape.

  ;; $client->get(url) — Guzzle and friends
  (member_call_expression
    object: (variable_name) @kinesis_object
      ;; No anchors and no escaped dollar. A PHP variable_name's text INCLUDES the leading $, and
      ;; an anchored pattern escaping it (^(\$client|...)$) compiled without complaint and matched
      ;; nothing — the ADR 0071 shape, found only because the fixture asserted on a real parse.
      (#match? @kinesis_object "(client|http|guzzle)")
    name: (name) @req_method
      (#match? @req_method "^(get|post|put|patch|delete|head|request|send)$")
    ;; PHP calls a double-quoted literal encapsed_string, not string — a pattern using string
    ;; compiles cleanly and matches nothing, which is the ADR 0071 shape. Both forms are listed
    ;; because a single-quoted URL is the other half of the same idiom.
    arguments: (arguments (argument [(encapsed_string) (string)] @kinesis_request_url))) @kinesis_request
`;
