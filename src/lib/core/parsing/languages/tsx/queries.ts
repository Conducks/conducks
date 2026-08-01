/**
 * Conducks — TSX SCM Query 🏺 🟦
 *
 * Superset of TypeScript queries with JSX-specific node captures.
 */
export const TSX_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture
  (import_statement
    (import_clause (named_imports (import_specifier name: (identifier) @name alias: (identifier)? @alias)))
    source: (string) @source) @isImport


  ;; A DESTRUCTURED DYNAMIC IMPORT — the same fact as a named import, written differently:
  ;;   const { POST: stepAction } = await import('@/app/api/.../route');
  ;; The local name is an ALIAS for POST, and the source states it. Without this the call to
  ;; stepAction(...) carried the LOCAL name, which dangled where nothing else owned that name and,
  ;; worse, bound to an unrelated same-named export where something did — one measured wrong edge
  ;; (sendMessage -> MessagingService.sendMessage, a different function entirely). Reuses the
  ;; @isBinding machinery: @name is the local name a node is minted for, @alias the original symbol.
  (variable_declarator
    (object_pattern (pair_pattern key: (property_identifier) @alias value: (identifier) @name))
    value: (await_expression (call_expression function: (import) arguments: (arguments (string) @source)))) @isBinding
  (variable_declarator
    (object_pattern (shorthand_property_identifier_pattern) @name)
    value: (await_expression (call_expression function: (import) arguments: (arguments (string) @source)))) @isBinding

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  ;; The optional value pattern carries an ARROW FUNCTION's signature without a second pattern —
  ;; a second one would match the same declarator and race the first to create the node. A plain
  ;; variable simply captures neither, so nothing else changes.
  (variable_declarator name: (identifier) @name
    value: (arrow_function parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type)?) @isVariable

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  ;; 'abstract class' is (abstract_class_declaration), a DIFFERENT node type — without this an
  ;; abstract class was extracted only when it had heritage (the heritage patterns below).
  (abstract_class_declaration name: (type_identifier) @name) @isStruct
  (interface_declaration name: (type_identifier) @name) @isInterface
  (type_alias_declaration name: (type_identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isEnum

  (function_declaration name: (identifier) @name parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type) @isFunction

  ;; A GENERATOR is a different node type, and nothing matched it — so a starred function produced
  ;; NO NODE AT ALL (not even a variable), which is a hole in the graph rather than a missing
  ;; signature. Found while extending signatures to eleven languages; TypeScript and TSX had the
  ;; same hole, so it was never a JavaScript-only gap (ADR 0088).
  (generator_function_declaration
    name: (identifier) @name
    parameters: (formal_parameters) @params) @isFunction
  (method_definition name: (_) @name parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type) @isMethod

  ;; Heritage: extends / implements (EXTENDS + IMPLEMENTS edges)
  ;; Identical grammar family to typescript (tree-sitter-typescript 0.23.2 exposes tsx as a second
  ;; language over the same node types) — the shapes were re-probed against the TSX grammar, not
  ;; assumed. See typescript/queries.ts for the full rationale: @name MUST be co-captured or
  ;; reflector.ts:438 drops the @heritage capture, and an interface uses (extends_type_clause),
  ;; never (class_heritage). 'abstract class' is its own node type. The capture NAME carries the
  ;; relation type: @heritage_extends -> EXTENDS, @heritage_implements -> IMPLEMENTS (the clause is
  ;; known here, so HeritageProcessor's target-name heuristic must not re-guess it).
  (class_declaration
    name: (type_identifier) @name
    (class_heritage (extends_clause value: (_) @heritage_extends))) @isStruct
  (class_declaration
    name: (type_identifier) @name
    (class_heritage (implements_clause (_) @heritage_implements))) @isStruct
  (abstract_class_declaration
    name: (type_identifier) @name
    (class_heritage (extends_clause value: (_) @heritage_extends))) @isStruct
  (abstract_class_declaration
    name: (type_identifier) @name
    (class_heritage (implements_clause (_) @heritage_implements))) @isStruct
  (interface_declaration
    name: (type_identifier) @name
    (extends_type_clause type: (_) @heritage_extends)) @isInterface

  ;; --- Type positions (ADR 0016) ---
  (type_annotation (type_identifier) @pulse_type_target)
  (type_annotation (generic_type name: (type_identifier) @pulse_type_target))
  (type_arguments (type_identifier) @pulse_type_target)
  ;; todo14: type positions the above missed — each captures only its DIRECT type_identifier
  ;; children; nesting (Bar[] inside a union, Foo[] inside as) is covered by the sibling patterns.
  (constraint (type_identifier) @pulse_type_target)
  (type_arguments (generic_type name: (type_identifier) @pulse_type_target))
  (array_type (type_identifier) @pulse_type_target)
  (as_expression (type_identifier) @pulse_type_target)
  (type_predicate type: (type_identifier) @pulse_type_target)
  (union_type (type_identifier) @pulse_type_target)

  ;; --- Cross-service HTTP (todo22#P15) ---
  ;; processRoute/processRequest in the reflector branch on @kinesis_route and @kinesis_request.
  ;; NO grammar defined either capture, so both were dead code in every language and
  ;; bindRouteCircuits never had a node to match. Probed against the real grammar before
  ;; being added, per memory.md.
  ;; Express/Koa style: app.get('/path', handler)
  (call_expression
    function: (member_expression
      object: (identifier)
      property: (property_identifier) @route_method
        (#match? @route_method "^(get|post|put|patch|delete|all)$"))
    arguments: (arguments . (string) @kinesis_route_path)) @kinesis_route

  ;; fetch('/url') — the request side of the same pair.
  (call_expression
    function: (identifier) @req_fn (#match? @req_fn "^(fetch)$")
    arguments: (arguments . (string) @kinesis_request_url)) @kinesis_request

  ;; --- Infrastructure (L3-L4: Entry Points) ---
  ;; Decorators: @Controller('/path'), @Get('/path')
  (decorator
    [(call_expression
        function: (identifier) @infra_method (#match? @infra_method "^(Controller|Get|Post|Put|Delete|Patch|Injectable|Inject|Entity)$")
        arguments: (arguments (string) @kinesis_route_path))
     (identifier) @infra_method (#match? @infra_method "^(Injectable|Inject|Entity)$")]) @isInfra

  ;; React Hooks: const [x, setX] = useState()
  (variable_declarator
    name: (array_pattern (identifier) @pulse_assignment_name)
    value: (call_expression function: (identifier) @infra_method (#match? @infra_method "^use.*$"))) @isInfra

  ;; --- JSX Infrastructure ---
  (jsx_element) @isInfra
  (jsx_attribute (property_identifier) @isProperty)

  ;; JSX component render IS usage: link <Component/> to its definition so
  ;; React components are not reported as dead code. Lowercase HTML tags
  ;; (div, span) resolve to nothing and are harmlessly dropped.
  (jsx_opening_element name: (_) @kinesis_target)
  (jsx_self_closing_element name: (_) @kinesis_target)

  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)

  ;; --- Pulse Flow (declarations) ---
  ;; A const declaration with a call value is how a handover is almost always written in
  ;; TS/JS, and only assignment_expression (a REassignment) was captured — so
  ;; bindPulseCircuits had nothing to bind on idiomatic code and the vault held zero
  ;; PULSES_TO edges on every project. Scoped to a call value on purpose: a literal
  ;; initialiser is not a handover and would be noise.
  (variable_declarator
    name: (identifier) @pulse_assignment_name
    value: (call_expression) @pulse_assignment_value)

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
  (export_statement (function_declaration name: (identifier) @name parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type) @isExported) @isFunction
  (export_statement (class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement (abstract_class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)) @isExported) @isVariable
  (function_declaration "async" name: (identifier) @name parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type) @isAsync @isFunction
  (abstract_method_signature name: (_) @name) @isAbstract @isMethod

  ;; --- Metadata & Debt ---
  (comment) @comment


  ;; Value-uses invisible to call/assignment patterns (todo14 FP closure):
  ;; a local re-export is a USE of the binding; iterating a collection reads it.
  (export_statement (export_clause (export_specifier name: (identifier) @ref_value)))
  (for_in_statement right: (identifier) @ref_value)

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
    name: (identifier) @instance_call_name
    value: (call_expression function: (member_expression) @instance_call_target)) @isInstanceCall

  (variable_declarator
    name: (identifier) @instance_name
    value: (new_expression constructor: [(identifier) (member_expression)] @instance_type)) @isInstanceOf

  ;; The same, through a fallback: const R = globalThing ?? new ServiceRegistry(). The type is
  ;; still stated literally; only the reachability is conditional.
  (variable_declarator
    name: (identifier) @instance_name
    value: (binary_expression right: (new_expression constructor: [(identifier) (member_expression)] @instance_type))) @isInstanceOf
`;
