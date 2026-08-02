/**
 * Conducks — High-Fidelity TypeScript SCM Query 🏺 🟦 (Omni-Detail)
 * 
 * Captures Decorators, Interfaces, Type Aliases, and Heritage.
 */
export const TYPESCRIPT_QUERIES = `
  ;; --- Imports & Re-exports (L3-L4: Kinesis) ---
  (import_statement source: (string) @source) @isImport
  (export_statement source: (string) @source) @isImport
  ;; Per-binding capture: each named import specifier gets its own match with @name
  (import_statement
    (import_clause (named_imports (import_specifier name: (identifier) @name alias: (identifier)? @alias)))
    source: (string) @source) @isImport

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

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  ;; 'abstract class' is (abstract_class_declaration), a DIFFERENT node type — without these two an
  ;; abstract class was extracted only when it had heritage (the heritage patterns below), so a
  ;; heritage-less abstract base (e.g. ConducksPrism, prism-core.ts:11) produced no node at all.
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
