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

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  (variable_declarator name: (identifier) @name) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  ;; 'abstract class' is (abstract_class_declaration), a DIFFERENT node type — without these two an
  ;; abstract class was extracted only when it had heritage (the heritage patterns below), so a
  ;; heritage-less abstract base (e.g. ConducksPrism, prism-core.ts:11) produced no node at all.
  (abstract_class_declaration name: (type_identifier) @name) @isStruct
  (interface_declaration name: (type_identifier) @name) @isInterface
  (type_alias_declaration name: (type_identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isEnum
  
  (function_declaration name: (identifier) @name) @isFunction
  (method_definition name: (_) @name) @isMethod
  
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
  (export_statement (function_declaration name: (identifier) @name) @isExported) @isFunction
  (export_statement (class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement (abstract_class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)) @isExported) @isVariable
  ;; Interfaces and type aliases were MISSING here, so an exported type or interface produced a node
  ;; with isExport absent. Anything keyed off isExport then read every exported type as private — on
  ;; conducks itself that was 55 of 98 STRUCTURE nodes under domain/, and the domain-visibility-rule
  ;; sentinel rule reported each one as a violation the moment that rule was made to fire at all.
  (export_statement (interface_declaration name: (type_identifier) @name) @isExported) @isInterface
  (export_statement (type_alias_declaration name: (type_identifier) @name) @isExported) @isInterface
  (function_declaration "async" name: (identifier) @name) @isAsync @isFunction
  (abstract_method_signature name: (_) @name) @isAbstract @isMethod

  ;; --- Metadata & Debt ---
  (comment) @comment


  ;; Value-uses invisible to call/assignment patterns (todo14 FP closure):
  ;; a local re-export is a USE of the binding; iterating a collection reads it.
  (export_statement (export_clause (export_specifier name: (identifier) @ref_value)))
  (for_in_statement right: (identifier) @ref_value)
`;
