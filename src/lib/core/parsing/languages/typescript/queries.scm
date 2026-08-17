  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture: each named import specifier gets its own match with @name
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

  ;; Barrel re-export, per specifier: "export { coreDb as db } from ./DatabaseManager".
  ;;
  ;; The whole-file @isImport pattern above (@source only) sees the statement but not which names
  ;; it republishes, so reflection-pipeline.ts had no way to know a downstream "import { db } from
  ;; '@/core/database/server'" should land on anything other than a symbol literally named "db"
  ;; DEFINED in the target file — and a pure re-export defines no such symbol, only the ORIGINAL
  ;; module does, often under a different name. Every one of those per-binding BIND:: edges dangled.
  ;;
  ;; @name is tagged onto the grammar's PUBLIC name — the "alias:" field when the specifier renames
  ;; ("x as y"), otherwise the plain "name:" field — because @isBinding (a DEFINITION_CAPTURES member,
  ;; see capture-tags.ts) makes the reflector's existing node-creation path (reflector.ts ~L322) mint
  ;; a real node "<thisFile>::<publicName>". That is not a guess: the AST proves this file exports a
  ;; binding by that name, same certainty as any other declaration — ADR 0070's refusal is about
  ;; fabricating a TARGET from a coincidence, not about declining to record a fact this file's own
  ;; syntax states outright. It is what makes the downstream BIND:: edge land on something real.
  ;;
  ;; The renamed pattern also tags the grammar's "name:" field (the ORIGINAL symbol, "coreDb") as
  ;; @alias. reflector.ts already has an UNUSED branch for exactly this (cName === "alias" && node,
  ;; ~L539) that calls BindingProcessor.processAlias and emits a durable ALIASES edge
  ;; publicName -> originalName. IntraLinker (linker-intra.ts) already classifies ALIASES as
  ;; RESOLVABLE (ADR 0053) and, scoped to files this one imports, rebinds the bare original name to
  ;; its real cross-file definition in a later pass — the same mechanism CALLS/TYPE_REFERENCE use, no
  ;; new resolution code needed. One hop per IntraLinker pass; chained barrels (a barrel re-exporting
  ;; another barrel) resolve to the next hop's node, not all the way to the root definition. See ADR
  ;; 0071 for what that leaves open ("export * from", multi-hop chains, cycles) and why this scope is
  ;; the deliberate first step.
  ;;
  ;; !alias (renamed pattern requires it present, this one requires it absent) keeps the two
  ;; patterns from double-matching the same specifier; a local re-export ("export { x }", no "from")
  ;; has no "source:" field and is untouched, still handled by the existing @ref_value pattern below.
  (export_statement
    (export_clause (export_specifier name: (identifier) @alias alias: (identifier) @name))
    source: (string) @source) @isBinding
  (export_statement
    (export_clause (export_specifier name: (identifier) @name !alias))
    source: (string) @source) @isBinding


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
  ;; node is minted at the IMPLEMENTATION — so the doc sat outside the join window and `register`
  ;; carried nothing while `has` beside it carried its own. Captured as lines, not as nodes: an
  ;; overload signature declares no body and mints nothing; its LINE is what lets the doc join
  ;; anchor at the first signature instead of the implementation.
  (method_signature name: (property_identifier) @overload_name)
  (function_signature name: (identifier) @overload_name)

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  ;; 'abstract class' is (abstract_class_declaration), a DIFFERENT node type — without these two an
  ;; abstract class was extracted only when it had heritage (the heritage patterns below), so a
  ;; heritage-less abstract base (e.g. ConducksPrism, prism-core.ts:11) produced no node at all.
  (abstract_class_declaration name: (type_identifier) @name) @isStruct
  (interface_declaration name: (type_identifier) @name) @isInterface
  ;; TYPEOF ALIAS (todo42#P2): `type Registry = typeof registry` states, in the source, that the
  ;; TYPE is the shape of the VARIABLE. ONE pattern with a value ALTERNATION — a second pattern
  ;; matching the same node would race it to create the node (ADR 0086), and a `?` quantifier on
  ;; the field child was measured to drop the capture even when the branch matched. The wildcard
  ;; arm keeps every plain alias matching exactly as before, capturing nothing.
  (type_alias_declaration name: (type_identifier) @name
    value: [(type_query (identifier) @typeof_target) (_)]) @isInterface
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
  ;; The subject @name is co-captured in the SAME pattern on purpose — the reflector only processes a
  ;; @heritage capture when the match also resolves a definition node (reflector.ts:438). The old
  ;; STANDALONE patterns ((class_heritage (extends_clause (_) @heritage)) etc.) compiled fine and
  ;; captured the supertype, but carried no @name, so no node existed and every capture was dropped
  ;; silently — the graph had ZERO heritage edges for TS. See docs/memory.md.
  ;; tree-sitter-typescript 0.23.2 shapes (verified against node-types.json + a compile probe):
  ;;   - a class's supertypes live in a (class_heritage) CHILD holding (extends_clause value: …)
  ;;     and/or (implements_clause …); extends_clause also has a type_arguments: field, so the
  ;;     value: field is required or 'extends Array<string>' would also capture 'string'.
  ;;   - an INTERFACE has no class_heritage; its supertypes sit in a sibling
  ;;     (extends_type_clause type: …). Different node entirely — do not merge the two.
  ;;   - 'abstract class' is (abstract_class_declaration), NOT (class_declaration) — a separate node
  ;;     type, so it needs its own patterns or every abstract base loses its heritage.
  ;; The capture NAME carries the relation type: @heritage_extends -> EXTENDS,
  ;; @heritage_implements -> IMPLEMENTS. TypeScript's grammar separates the two clauses, so the
  ;; relation is KNOWN here and must not be re-guessed downstream — plain @heritage falls back to
  ;; HeritageProcessor's target-NAME heuristic, which typed 'implements Speaker' as EXTENDS.
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
  ;; An interface's supertypes are always EXTENDS (interface extends interface).
  (interface_declaration
    name: (type_identifier) @name
    (extends_type_clause type: (_) @heritage_extends)) @isInterface

  ;; --- Type positions (ADR 0016) ---
  ;; A symbol used only here is erased by the compiler, so its import is not runtime coupling.
  ;; Without these captures the graph has no type-usage evidence at all and cannot tell a
  ;; type-only import from a real one.
  ;; todo14: type positions the above missed — each captures only its DIRECT type_identifier
  ;; children; nesting (Bar[] inside a union, Foo[] inside as) is covered by the sibling patterns.
  ;; An array OF a generic — PhaseRunResult<R>[], AutomatedTask<string>[]. The line above
  ;; captures only a DIRECT type_identifier child, so Plain[] was evidence and Boxed<T>[] was
  ;; not: the type_identifier sits one level deeper, under the generic_type. MEASURED on a subject —
  ;; AutomatedTask and PhaseRunResult were both reported STALE_IMPORT while the file annotates
  ;; with them, because this shape produced no type evidence at all.
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

  ;; --- Reference-as-value in object literals: { key: someSymbol } (DI tables, command maps) ---
  ;; The value identifier is a USE of that symbol, not a call. Feeds the reference-as-value path.
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
  ;; Interfaces and type aliases were MISSING here, so an exported type or interface produced a node
  ;; with isExport absent. Anything keyed off isExport then read every exported type as private — on
  ;; conducks itself that was 55 of 98 STRUCTURE nodes under domain/, and the domain-visibility-rule
  ;; sentinel rule reported each one as a violation the moment that rule was made to fire at all.
  (export_statement (interface_declaration name: (type_identifier) @name) @isExported) @isInterface
  (export_statement (type_alias_declaration name: (type_identifier) @name) @isExported) @isInterface
  (function_declaration "async" name: (identifier) @name parameters: (formal_parameters) @params return_type: (type_annotation)? @return_type) @isAsync @isFunction
  (abstract_method_signature name: (_) @name) @isAbstract @isMethod

  ;; --- Metadata & Debt ---
  (comment) @comment


  ;; Value-uses invisible to call/assignment patterns (todo14 FP closure):
  ;; a local re-export is a USE of the binding; iterating a collection reads it.
  (export_statement (export_clause (export_specifier name: (identifier) @ref_value)))
  ;; An identifier listed in an ARRAY literal is a use — the registrar-list / middleware-chain /
  ;; plugin-table shape (const registrars = [registerSafety, registerPrivacy]). The object-literal
  ;; twin above has been captured since todo14; the array form never was, so a symbol wired up this
  ;; way looked entirely unreferenced. MEASURED on a subject: six of its ten STALE_IMPORT findings were
  ;; registrars in one such array in src/app.ts — deleting any of them breaks the boot sequence.
  ;; A ternary BRANCH is a use for the same reason (flag ? undefined : registerEmbeddings). The
  ;; condition identifier is captured too and that is correct — reading a name to test it is a use.
  ;; Reading a MEMBER off an imported binding is a use of that binding — an enum reached only as
  ;; FailoverReason.Timeout, a const table read as CONFIG.key, a namespace object. A member READ
  ;; produced no evidence at all: only a member CALL did, through the kinesis pattern, so x.y() was
  ;; visible and x.y was not. MEASURED on a subject: this was the last remaining STALE_IMPORT false
  ;; positive, and closing it cost 3% more edges and 0.9s on a 1,095-file subject.
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
;; @include EC_DYNAMIC_IMPORT
;; @include EC_VALUE_POSITIONS
;; @include TS_PARAM_DEFAULTS
;; @include TS_TYPE_POSITIONS
