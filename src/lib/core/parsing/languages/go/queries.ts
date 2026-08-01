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
  ;; Signature capture (ADR 0086/0084): @params tags the WHOLE parameter_list, which the frozen
  ;; reflector.ts helper reads by iterating its namedChildren. @return_type is the 'result' field
  ;; (Go's grammar name, not 'return_type' — the CAPTURE name still has to be @return_type, that is
  ;; what the helper reads). 'result' can ALSO be a bare parameter_list for a multi-value return
  ;; ('func f() (Foo, error)'), and that shape is deliberately excluded from the alternation below:
  ;; capturing it verbatim would give the text "(Foo, error)" for a single declared TYPE, which is
  ;; not what the field means. Refusing (leaving @return_type absent -> null) is the ADR 0070 call;
  ;; a single named/pointer/qualified/generic result type is still captured verbatim, including a
  ;; pointer sigil ('*Foo') since that is exactly what the source states, not an approximation.
  (function_declaration name: (identifier) @name parameters: (parameter_list) @params result: [(type_identifier) (qualified_type) (generic_type) (pointer_type)]? @return_type) @isFunction
  (package_clause (package_identifier) @name) @isPackage

  ;; Modern Genetics (Go 1.18+)
  (type_parameter_list (type_parameter_declaration name: (identifier) @name)) @isGeneric
  (type_parameter_list (type_parameter_declaration) @generic_param)

  ;; Methods with Receivers
  ;; Same signature capture as @isFunction above. A method has TWO parameter_list nodes (receiver
  ;; and parameters); @params is anchored to the 'parameters:' field specifically, never the
  ;; receiver's, so 'func (s *S) M(x int)' records [x], not the receiver.
  (method_declaration
    receiver: (parameter_list (parameter_declaration type: (pointer_type [(type_identifier) (generic_type)] @receiver_type)))
    name: (field_identifier) @name
    parameters: (parameter_list) @params
    result: [(type_identifier) (qualified_type) (generic_type) (pointer_type)]? @return_type) @isMethod

  (method_declaration
    receiver: (parameter_list (parameter_declaration type: [(type_identifier) (generic_type)] @receiver_type))
    name: (field_identifier) @name
    parameters: (parameter_list) @params
    result: [(type_identifier) (qualified_type) (generic_type) (pointer_type)]? @return_type) @isMethod

  ;; Structs and Interfaces
  (type_spec name: (type_identifier) @name type: (struct_type)) @isStruct
  (type_spec name: (type_identifier) @name type: (interface_type)) @isInterface

  ;; --- Infrastructure (L3: Entry Points & Routers) ---
  ;; Goroutine invocations
  (go_statement) @isInfra

  ;; Channel type declarations
  (channel_type) @isInfra

  ;; Select statements (concurrency control flow)
  (select_statement) @isInfra

  ;; Make with channel
  (call_expression
    function: (identifier) @source
    (#eq? @source "make")
    arguments: (argument_list (channel_type))) @isInfra

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
  (method_elem name: (field_identifier) @name) @isMethod

  ;; Embedding IS Go's inheritance (EXTENDS / IMPLEMENTS edges).
  ;; Go has no extends/implements keyword. The only structural "is-a" the source states outright is
  ;; EMBEDDING, so that is what heritage means here:
  ;;   - struct embedding  'type Service struct { Base; *Logger }'  -> Service EXTENDS Base, Logger
  ;;   - interface embedding 'type ReadWriter interface { Reader }'  -> ReadWriter EXTENDS Reader
  ;; NOT recorded as heritage: a named field ('db *sql.DB' is composition-by-reference, not is-a) and
  ;; implicit interface satisfaction (nothing in the syntax says it — that needs type inference).
  ;;
  ;; The old pattern was '(field_declaration type: [...] @heritage)' — doubly wrong: STANDALONE, so
  ;; reflector.ts:438 dropped every capture (no co-captured @name -> no node); and it matched EVERY
  ;; struct field, so had it worked, 'name string' would have made a struct "extend" string.
  ;;
  ;; tree-sitter-go 0.25 shapes (verified by compile probe):
  ;;   - an EMBEDDED struct field is a (field_declaration) with NO 'name:' field, only 'type:'; a
  ;;     leading '*' is an anonymous token, so '*Logger' still yields a bare (type_identifier).
  ;;     Queries cannot assert a field is ABSENT, so the leading '.' anchor does the work: it pins
  ;;     the type to the FIRST named child, which only holds for an embedded field (a named field
  ;;     puts (field_identifier) there). Probed: 'name string' and 'm map[string]int' do not match.
  ;;   - an EMBEDDED interface is a (type_elem), a sibling of (method_elem); a qualified embed like
  ;;     'io.Closer' is a (qualified_type), whose text carries the full dotted path.
  (type_spec
    name: (type_identifier) @name
    type: (struct_type
      (field_declaration_list
        (field_declaration . type: [(type_identifier) (qualified_type) (generic_type)] @heritage)))) @isStruct
  (type_spec
    name: (type_identifier) @name
    type: (interface_type
      (type_elem [(type_identifier) (qualified_type) (generic_type)] @heritage))) @isInterface

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

  ;; --- Imports & Aliases ---
  (import_spec name: (package_identifier) @alias path: [(interpreted_string_literal) (raw_string_literal)] @source) @isBinding
  (import_spec path: [(interpreted_string_literal) (raw_string_literal)] @source) @isImport

  ;; --- Debt Markers ---
  (comment) @comment

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; http.Get(url) · http.Post(url, ...) · client.Do/Get/Post. Go's stdlib client is the receiver
  ;; flow.ts needs as evidence — a bare Get(...) proves nothing.
  (call_expression
    function: (selector_expression
      operand: (identifier) @kinesis_object
        (#match? @kinesis_object "^(http|client|Client|httpClient)$")
      field: (field_identifier) @req_method
        (#match? @req_method "^(Get|Post|Put|Patch|Delete|Head|Do|NewRequest|PostForm)$"))
    arguments: (argument_list . (interpreted_string_literal) @kinesis_request_url)) @kinesis_request
`;
