/**
 * Conducks — High-Fidelity JavaScript SCM Query 🏺 🟨 (Omni-Detail)
 *
 * JavaScript-only variant: no TS-specific nodes (interface, type alias, declare,
 * type parameters, abstract classes, decorators). Adds CommonJS require() support.
 */
export const JAVASCRIPT_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture
  (import_statement
    (import_clause (named_imports (import_specifier name: (identifier) @name alias: (identifier)? @alias)))
    source: (string) @source) @isImport

  ;; --- CommonJS require() ---
  (variable_declarator
    name: (identifier) @name
    value: (call_expression
      function: (identifier) @_req (#eq? @_req "require")
      arguments: (arguments (string) @source))) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  ;; tree-sitter-javascript 0.25 has NO property_signature / public_field_definition (both are
  ;; TS-only). They were copied from the TS query and made THIS WHOLE QUERY fail to compile
  ;; (TSQueryErrorNodeType at offset 607), which silently dropped every .js file to the Gnosis
  ;; file-only fallback. The JS class field node is (field_definition property: …).
  (field_definition property: (property_identifier) @name) @isProperty
  (variable_declarator name: (identifier) @name) @isVariable

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (identifier) @name) @isStruct

  (function_declaration name: (identifier) @name) @isFunction
  (method_definition name: (_) @name) @isMethod

  ;; Heritage: extends (EXTENDS edge). JS has no 'implements'.
  ;; Two bugs fixed here at once:
  ;;   1. tree-sitter-javascript 0.25 has NO (extends_clause) node — the JS (class_heritage) holds
  ;;      the superclass EXPRESSION directly. The old pattern therefore failed to compile and took
  ;;      the whole JS query down with it (see the Atoms note above).
  ;;   2. it was STANDALONE, so even had it compiled, reflector.ts:438 would have dropped the
  ;;      capture for want of a co-captured @name. See docs/memory.md.
  (class_declaration
    name: (identifier) @name
    (class_heritage (_) @heritage_extends)) @isStruct

  ;; --- React Hooks: const [x, setX] = useState() ---
  (variable_declarator
    name: (array_pattern (identifier) @pulse_assignment_name)
    value: (call_expression function: (identifier) @infra_method (#match? @infra_method "^use.*$"))) @isInfra

  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; Reference-as-value in object literals: { key: someSymbol } (DI tables, command maps)
  (pair value: (identifier) @ref_value)

  ;; --- Kinesis (Execution Flow) ---
  (call_expression
    function: [(identifier) (member_expression) (super)] @kinesis_target
    arguments: (arguments (_)* @kinesis_arg))
  (new_expression
    constructor: (identifier) @kinesis_target
    arguments: (arguments (_)* @kinesis_arg))

  ;; --- Modifiers (DNA flags) ---
  (export_statement (function_declaration name: (identifier) @name) @isExported) @isFunction
  (export_statement (class_declaration name: (identifier) @name) @isExported) @isStruct
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)) @isExported) @isVariable
  (function_declaration "async" name: (identifier) @name) @isAsync @isFunction

  ;; --- Metadata & Debt ---
  (comment) @comment

  ;; --- Kinesis: the ROUTE half. JavaScript had NEITHER half until now ---
  ;;
  ;; The express pattern existed in the TypeScript queries and was never copied here, so a plain
  ;; .js server declared no route at all. Found by building a two-service fixture and watching the
  ;; Python caller resolve while the JavaScript route it called stayed invisible.
  (call_expression
    function: (member_expression
      object: (identifier)
      property: (property_identifier) @route_method
        (#match? @route_method "^(get|post|put|patch|delete|all)$"))
    arguments: (arguments . (string) @kinesis_route_path)) @kinesis_route

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; Seven languages could already declare a ROUTE and none could declare a CALLER, so a
  ;; cross-service edge was one-directional outside TypeScript. @kinesis_request_url is the URL,
  ;; and the RECEIVER capture is what proves it is a network call rather than any other .get() —
  ;; flow.ts rejects an unknown receiver unless the URL carries an absolute protocol.

  ;; fetch('/url')
  (call_expression
    function: (identifier) @req_fn (#match? @req_fn "^(fetch)$")
    arguments: (arguments . (string) @kinesis_request_url)) @kinesis_request

  ;; axios.get('/url') · client.post('/url') · got.put(...)
  (call_expression
    function: (member_expression
      object: (identifier) @kinesis_object
        (#match? @kinesis_object "^(axios|got|superagent|ky|client|session|http)$")
      property: (property_identifier) @req_method
        (#match? @req_method "^(get|post|put|patch|delete|head|options|request)$"))
    arguments: (arguments . (string) @kinesis_request_url)) @kinesis_request

  ;; axios('/url') — the callable form
  (call_expression
    function: (identifier) @req_fn (#match? @req_fn "^(axios|got|ky)$")
    arguments: (arguments . (string) @kinesis_request_url)) @kinesis_request

  ;; --- const x = new Y() — the variable's TYPE, read from its own declaration (todo29#P3b) ---
  ;;
  ;; A CONSTRUCTS edge already exists for every new Y(), but its SOURCE is the enclosing scope, so
  ;; at module level it says "this FILE constructs a ServiceRegistry" and not "Registry IS one".
  ;; Without that link a later registry.get(...) has no way to reach ServiceRegistry.get, which
  ;; is 192 of mentorseed's dangling edges.
  ;;
  ;; This reads a DECLARATION, it does not infer: the type is written literally in the source. A
  ;; factory (X.getInstance()) is deliberately NOT matched — its return type is not stated here and
  ;; assuming it is the guess ADR 0070 refuses.
  (variable_declarator
    name: (identifier) @instance_name
    value: (new_expression constructor: [(identifier) (member_expression)] @instance_type)) @isInstanceOf

  ;; The same, through a fallback: const R = globalThing ?? new ServiceRegistry(). The type is
  ;; still stated literally; only the reachability is conditional.
  (variable_declarator
    name: (identifier) @instance_name
    value: (binary_expression right: (new_expression constructor: [(identifier) (member_expression)] @instance_type))) @isInstanceOf
`;
