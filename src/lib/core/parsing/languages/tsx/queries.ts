/**
 * Conducks — TSX SCM Query 🏺 🟦
 *
 * Superset of TypeScript queries with JSX-specific node captures.
 */
import { EC_VALUE_POSITIONS, EC_DYNAMIC_IMPORT, TS_PARAM_DEFAULTS, TS_TYPE_POSITIONS } from '../ecmascript-positions.js';

export const TSX_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture
  (import_statement
    (import_clause (named_imports (import_specifier name: (identifier) @name alias: (identifier)? @alias)))
    source: (string) @source) @isImport

  ;; DEFAULT IMPORT and DEFAULT EXPORT — the two halves of one fact.
  ;;
  ;; A default import binds a local name to whatever the target module publishes as its default, and
  ;; the two names routinely differ: a default import written as SessionsPage reaches a declaration
  ;; exported as OrgSessionsPage. Only NAMED specifiers had a per-binding capture, so
  ;; the local name was never registered at all — the call fell through to a bare name, dangled, and
  ;; the exported declaration was left with no incoming edge. MEASURED on the monorepo subject, where
  ;; a page component is imported exactly this way by the route file beside it and reported ORPHAN.
  ;;
  ;; The importing file cannot know the exported NAME, so the two are joined through the name
  ;; default: the import binds its local to it, and the exporting file records which symbol it is. No
  ;; is-prefix on either capture — this mints no node, it only names one that already exists.
  (import_statement
    (import_clause (identifier) @default_import)
    source: (string) @source) @isImport

  (export_statement "default"
    declaration: (function_declaration name: (identifier) @default_export_name))
  (export_statement "default"
    declaration: (class_declaration name: (type_identifier) @default_export_name))



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

  ;; MODULE AUGMENTATION — TypeScript declaration merging.
  ;;
  ;;   declare module '@/core/registry/Registry' { interface ServiceTypeMap { ... } }
  ;;
  ;; The augmenting file states which module and which type it extends, so this is a reference the
  ;; source writes down — no import and no call, which is why nothing referenced the original and
  ;; prune reported a live interface as dead on a real subject (todo33).
  ;;
  ;; Captures carry no is-prefix on purpose: an is-capture is a DEFINITION and would mint a node here,
  ;; and this file does not define ServiceTypeMap, it extends one that lives elsewhere.
  (ambient_declaration
    (module name: (string) @augments_source
      body: (statement_block (interface_declaration name: (type_identifier) @augments_name))))

  ;; An INTERFACE's member types. A parameter typed PrismSpectrum, then a call on its nodes, is
  ;; readable end to end — the parameter states its type, the interface states that nodes is a
  ;; SpectrumNode array, and find is an Array method. 293 unresolved references on this repository
  ;; are that exact shape, and nothing read the middle step (todo36).
  (interface_declaration
    name: (type_identifier) @iface_name
    body: (interface_body) @iface_body)

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  ;; The optional value pattern carries an ARROW FUNCTION's signature without a second pattern —
  ;; a second one would match the same declarator and race the first to create the node. A plain
  ;; variable simply captures neither, so nothing else changes.
  (variable_declarator name: (identifier) @name
    value: (arrow_function parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type)?) @isVariable

  ;; A variable whose value is an OBJECT LITERAL. The whole literal is captured so the reflector can
  ;; walk it and record which identifier each property path aliases — a DI container is exactly this
  ;; shape, and a chain like container.services.registry.lookup has no dynamic hop at all (todo30).
  (variable_declarator
    name: (identifier) @object_name
    value: (object) @object_value) @isVariable


  ;; OVERLOAD SIGNATURES (todo44#P5 residue): a doc comment sits above the FIRST overload, and the
  ;; node is minted at the IMPLEMENTATION — so the doc sat outside the join window and \`register\`
  ;; carried nothing while \`has\` beside it carried its own. Captured as lines, not as nodes: an
  ;; overload signature declares no body and mints nothing; its LINE is what lets the doc join
  ;; anchor at the first signature instead of the implementation.
  (method_signature name: (property_identifier) @overload_name)
  (function_signature name: (identifier) @overload_name)

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
  ;; todo14: type positions the above missed — each captures only its DIRECT type_identifier
  ;; children; nesting (Bar[] inside a union, Foo[] inside as) is covered by the sibling patterns.
  ;; An array OF a generic — the type_identifier sits under the generic_type, one level deeper than
  ;; the line above reaches, so Boxed<T>[] produced no type evidence while Plain[] did. Kept in
  ;; step with the TypeScript grammar, where a frozen subject measured the false positives closed.
  ;; A PARENTHESISED type, which the array form makes routine: (Role)[] wraps the identifier in a
  ;; parenthesized_type, one level below where the two array patterns above reach. Found by running
  ;; the benchmark against the monorepo subject — Role was reported STALE_IMPORT while line 43 of
  ;; authz.ts annotates with it as ...roles: (Role)[]. Captured on its own rather than only under
  ;; array_type, because a parenthesised type is legal in every type position.
  ;; INTERSECTION is union's twin and was simply missing beside it — DriftResult in
  ;; Promise<DriftResult & {...}> produced no type evidence, so prune told this repository to delete
  ;; an import registry/index.ts annotates with. Measured on conducks itself.
  ;; A CONDITIONAL type reads both the checked type and the one it is checked against
  ;; (T extends EdgeType ? ... : ...). graph-engine.ts uses EdgeType only this way.

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
  ;; OBJECT SHORTHAND is the same fact with the key omitted: { handleBack } is a read of handleBack,
  ;; and it is how every React hook returns its handlers and every context builds its value object.
  ;; The pair form above has been captured since todo14; the shorthand never was.
  ;; MEASURED on the monorepo subject: handleBack (returned at useonboardinglogic.ts:253) and
  ;; openClient (waitlistcontext.tsx:56) were both reported ORPHAN while being handed to callers.
  ;; DEFAULT EXPORT names the symbol it re-publishes. export default Card is the whole reason a
  ;; component file exists, and Card was reported ORPHAN with the export sitting on the next line
  ;; (admin/src/components/ui/card/index.tsx:35). The named form export { X } was already covered.

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
  ;; The EXPORTED form needs the signature captures too. Without them this pattern won the race to
  ;; create the node — it matches the same declarator as the plain rule above — and an exported arrow
  ;; function recorded no parameters and no return type while an unexported one recorded both. Found
  ;; by the oracle fixture; the unit test used the unexported form and passed (ADR 0091).
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name
    value: (arrow_function parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type)?)) @isExported) @isVariable
  (function_declaration "async" name: (identifier) @name parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type) @isAsync @isFunction
  (abstract_method_signature name: (_) @name) @isAbstract @isMethod

  ;; --- Metadata & Debt ---
  (comment) @comment


  ;; Value-uses invisible to call/assignment patterns (todo14 FP closure):
  ;; a local re-export is a USE of the binding; iterating a collection reads it.
  (export_statement (export_clause (export_specifier name: (identifier) @ref_value)))
  ;; Array-literal and ternary-branch uses, in step with the TypeScript grammar — a component list
  ;; (const panels = [ConsolePanel, GlobePanel]) and a conditional render target are both reads of
  ;; the binding, and neither produced any evidence before.
  ;; A JSX EXPRESSION CONTAINER is how every React handler is wired: onClick={handleSave}. The
  ;; identifier sits in (jsx_attribute (jsx_expression (identifier))) and no other pattern reached
  ;; it, so a handler declared and then passed to a prop looked entirely unreferenced.
  ;;
  ;; MEASURED on the monorepo subject: 28 of its 126 ORPHAN findings were handlers referenced this
  ;; way — handleAction at onAction={handleAction}, exportCSV at onClick={exportCSV}. In a React
  ;; codebase this is not an edge case, it is how the components are joined together.
  (jsx_expression (identifier) @ref_value)
  ;; A member READ is a use of the object, same as the TypeScript grammar — only member CALLS were
  ;; visible before, so an enum or const table reached as X.member looked entirely unreferenced.
  ;; INSTANCEOF names a class as a value — the right operand is a bare identifier, so no member,
  ;; call or type pattern ever saw it. Measured on conducks itself: FilterValidationError is used
  ;; only as an instanceof operand and prune reported it stale.

  ;; --- const x = new Y() — the variable's TYPE, read from its own declaration (todo29#P3b) ---
  ;;
  ;; A CONSTRUCTS edge already exists for every new Y(), but its SOURCE is the enclosing scope, so
  ;; at module level it says "this FILE constructs a ServiceRegistry" and not "Registry IS one".
  ;; Without that link a later registry.get(...) has no way to reach ServiceRegistry.get, which
  ;; is 192 of one measured subject's dangling edges.
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
${EC_DYNAMIC_IMPORT}
${EC_VALUE_POSITIONS}
${TS_PARAM_DEFAULTS}
${TS_TYPE_POSITIONS}
`;
