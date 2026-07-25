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

  ;; --- Atoms (L6: Persistence & State) ---
  (property_signature name: (property_identifier) @name) @isProperty
  (public_field_definition name: (property_identifier) @name) @isProperty
  (variable_declarator name: (identifier) @name) @isVariable

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration name: (type_identifier) @name) @isStruct
  ;; 'abstract class' is (abstract_class_declaration), a DIFFERENT node type — without this an
  ;; abstract class was extracted only when it had heritage (the heritage patterns below).
  (abstract_class_declaration name: (type_identifier) @name) @isStruct
  (interface_declaration name: (type_identifier) @name) @isInterface
  (type_alias_declaration name: (type_identifier) @name) @isInterface
  (enum_declaration name: (identifier) @name) @isEnum

  (function_declaration name: (identifier) @name) @isFunction
  (method_definition name: (_) @name) @isMethod

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
  (export_statement (class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement (abstract_class_declaration name: (type_identifier) @name) @isExported) @isStruct
  (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)) @isExported) @isVariable
  (function_declaration "async" name: (identifier) @name) @isAsync @isFunction
  (abstract_method_signature name: (_) @name) @isAbstract @isMethod

  ;; --- Metadata & Debt ---
  (comment) @comment


  ;; Value-uses invisible to call/assignment patterns (todo14 FP closure):
  ;; a local re-export is a USE of the binding; iterating a collection reads it.
  (export_statement (export_clause (export_specifier name: (identifier) @ref_value)))
  (for_in_statement right: (identifier) @ref_value)
`;
